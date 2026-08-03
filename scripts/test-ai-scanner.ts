/**
 * Phase 40 AI scanner smoke test — the phase's literal "Done when": the LLM
 * adds findings the rules missed, with no values in the payload.
 *
 * Run: npm run test:scanner:ai
 *
 * This is the live counterpart to lib/scanner/ai.test.ts, in the same
 * relationship scripts/test-scanner.ts has to lib/scanner/rules.test.ts: the
 * unit suite proves the payload assertion over hand-built fixtures, and this
 * proves the whole path — real ciphertext, real decryption, a real Groq
 * call, a real security_scans row.
 *
 * Unlike scripts/test-scanner.ts, this one **writes**: persisting the result
 * is part of what Phase 40 asks for. The rows are left in place afterwards
 * rather than cleaned up — scan history is exactly what that table is for,
 * and Phase 41's sparkline needs more than one row to draw anything.
 *
 * Requires `npm run seed` and a GROQ_API_KEY in .env.local.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const { createAdminClient } = await import("../lib/supabase/admin");
const { loadProjectForScan } = await import("../lib/scanner/queries");
const { runRuleBasedScan } = await import("../lib/scanner/rules");
const { assertScanPayloadIsSafe, buildScanPayload, buildScannerPrompt, isAiFinding, runAiScan } =
  await import("../lib/scanner/ai");
const { runSecurityScan, scoreFindings } = await import("../lib/scanner/scan");

const PROJECT_NAME = "Client Dashboard";

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("No GROQ_API_KEY in .env.local — this script needs a live provider.");
    process.exit(1);
  }

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, name")
    .eq("name", PROJECT_NAME)
    .maybeSingle();

  if (!project) {
    console.error(`No project named "${PROJECT_NAME}" — run \`npm run seed\` first.`);
    process.exit(1);
  }

  const scanned = await loadProjectForScan(admin, project.id);
  if (!scanned) {
    console.error(`Could not load project ${project.id} for scanning.`);
    process.exit(1);
  }

  const everyValue = scanned.environments
    .flatMap((environment) => environment.variables.map((variable) => variable.value))
    .filter((value) => value.length > 0);

  console.log(
    `\nScanned "${scanned.name}" — ${scanned.environments
      .map((environment) => `${environment.name}=${environment.variables.length}`)
      .join(" ")}\n`,
  );

  // -------------------------------------------------------------------------
  // 1. The payload, over real decrypted values.
  // -------------------------------------------------------------------------

  const payload = buildScanPayload(scanned);
  const serializedPayload = JSON.stringify(payload);

  console.log("Payload sent to the model (first environment):");
  console.log(`  ${JSON.stringify(payload.environments[0]).slice(0, 400)}…\n`);

  check("payload builds and passes its own assertion", true);

  const leakedIntoPayload = everyValue.filter((value) => serializedPayload.includes(value));
  check(
    "no decrypted value appears anywhere in the payload",
    leakedIntoPayload.length === 0,
    leakedIntoPayload.length > 0 ? `${leakedIntoPayload.length} value(s) leaked` : undefined,
  );

  const ruleFindings = runRuleBasedScan(scanned);
  const prompt = buildScannerPrompt({ payload, ruleFindings });
  const leakedIntoPrompt = everyValue.filter((value) => prompt.includes(value));
  check(
    "no decrypted value appears anywhere in the assembled prompt",
    leakedIntoPrompt.length === 0,
    leakedIntoPrompt.length > 0 ? `${leakedIntoPrompt.length} value(s) leaked` : undefined,
  );

  // The assertion still fires on live data if the payload is tampered with —
  // the unit suite proves this over fixtures, this proves it over real rows.
  let tamperCaught = false;
  try {
    const tampered = buildScanPayload(scanned);
    Object.assign(tampered.environments[0].variables[0], { value: everyValue[0] });
    assertScanPayloadIsSafe(tampered, scanned);
  } catch {
    tamperCaught = true;
  }
  check("adding a value field to a real payload is rejected", tamperCaught);

  // -------------------------------------------------------------------------
  // 2. The live call.
  // -------------------------------------------------------------------------

  console.log(`Rules found ${ruleFindings.length} findings. Asking the model for more…\n`);

  const aiFindings = await runAiScan({ project: scanned, ruleFindings });

  for (const finding of aiFindings) {
    console.log(
      `  [${finding.severity.toUpperCase()}] ${finding.environmentName}/${finding.key} (${finding.ruleId})`,
    );
    console.log(`      ${finding.message}`);
    console.log(`      Fix: ${finding.fix}`);
  }
  console.log("");

  check(
    "the model contributed at least one finding the rules missed",
    aiFindings.length > 0,
    `${aiFindings.length} AI findings`,
  );
  check("every AI finding is tagged as one", aiFindings.every(isAiFinding));

  const ruleIdentities = new Set(
    ruleFindings.map((finding) => `${finding.environmentName} ${finding.key} ${finding.ruleId}`),
  );
  check(
    "no AI finding duplicates a rule finding's identity",
    aiFindings.every(
      (finding) =>
        !ruleIdentities.has(`${finding.environmentName} ${finding.key} ${finding.ruleId}`),
    ),
  );

  const knownTargets = new Set(
    scanned.environments.flatMap((environment) =>
      environment.variables.map((variable) => `${environment.name} ${variable.key}`),
    ),
  );
  check(
    "every AI finding points at a variable that actually exists",
    aiFindings.every((finding) => knownTargets.has(`${finding.environmentName} ${finding.key}`)),
  );

  const leakedIntoAi = everyValue.filter((value) => JSON.stringify(aiFindings).includes(value));
  check(
    "no decrypted value came back in the model's findings",
    leakedIntoAi.length === 0,
    leakedIntoAi.length > 0 ? `${leakedIntoAi.length} value(s) leaked` : undefined,
  );

  // -------------------------------------------------------------------------
  // 3. Score, merge, persist.
  // -------------------------------------------------------------------------

  const before = await admin
    .from("security_scans")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  const result = await runSecurityScan({ supabase: admin, projectId: project.id });
  if (!result) {
    console.error("runSecurityScan returned null for a project that loaded a moment ago.");
    process.exit(1);
  }

  console.log("Per-environment scores:");
  for (const environment of result.environments) {
    console.log(
      `  ${environment.environmentName.padEnd(12)} ${environment.score === null ? "— (no variables)" : `${environment.score}/100`}  ${environment.findings.length} findings`,
    );
  }
  console.log(`\nAI layer: ${result.aiStatus}${result.aiDetail ? ` — ${result.aiDetail}` : ""}\n`);

  check("the AI layer reported success", result.aiStatus === "ok", result.aiDetail);

  const scored = result.environments.filter((environment) => environment.score !== null);
  check(
    "every score is between 0 and 100",
    scored.every((environment) => environment.score! >= 0 && environment.score! <= 100),
  );

  const development = result.environments.find(
    (environment) => environment.environmentName === "development",
  );
  check(
    "development — the environment the seed planted problems in — scores below 100",
    development !== undefined && development.score !== null && development.score < 100,
    development?.score === null ? "no variables" : `${development?.score}/100`,
  );

  check(
    "the score matches what the findings weigh",
    development !== undefined &&
      development.score === scoreFindings(development.findings),
  );

  const after = await admin
    .from("security_scans")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  const written = (after.count ?? 0) - (before.count ?? 0);
  check(
    "a security_scans row was written for each scored environment",
    written === scored.length,
    `${written} rows written`,
  );
  check("runSecurityScan reported that it persisted", result.persisted);

  // What actually landed in the database is the last place a value could
  // hide — issues is jsonb, and it is read back and rendered by Phase 41.
  const { data: rows } = await admin
    .from("security_scans")
    .select("score, issues")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(scored.length);

  const serializedRows = JSON.stringify(rows ?? []);
  const leakedIntoDatabase = everyValue.filter((value) => serializedRows.includes(value));
  check(
    "no decrypted value reached the persisted scan rows",
    leakedIntoDatabase.length === 0,
    leakedIntoDatabase.length > 0 ? `${leakedIntoDatabase.length} value(s) leaked` : undefined,
  );

  // -------------------------------------------------------------------------

  const failed = results.filter((result) => !result.pass);
  console.log("");
  for (const result of results) {
    console.log(
      `${result.pass ? "PASS" : "FAIL"} — ${result.name}${result.detail ? ` (${result.detail})` : ""}`,
    );
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  console.log(
    `\n${written} scan row(s) left in place — scan history is what security_scans is for.`,
  );

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("AI scanner test script crashed:", error);
  process.exit(1);
});
