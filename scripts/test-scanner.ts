/**
 * Phase 39 rule-based scanner smoke test — the phase's literal "Done when":
 * the seeded bad environment produces the expected findings.
 *
 * Run: npm run test:scanner
 *
 * Unlike lib/scanner/rules.test.ts, which runs the rules over hand-built
 * fixtures, this runs them over the *real* seeded rows in the live Supabase
 * project: fetched, decrypted through lib/crypto/envelope.ts, and scanned.
 * That is what makes it a check on the whole path rather than on the rules
 * in isolation — a scan that works on fixtures but not on real ciphertext
 * would pass the unit tests and fail here.
 *
 * The three problems scripts/seed.ts deliberately plants in "Client
 * Dashboard" (and nothing else in the dataset collides by accident):
 *   1. a live-looking Stripe key in development
 *   2. a 7-character JWT_SECRET in development
 *   3. NEXTAUTH_SECRET reused identically between staging and production
 *
 * Read-only: it fetches and decrypts, and writes nothing. Persisting a scan
 * result is Phase 40's job. It prints key names, severities, and messages —
 * never a value, which is exactly the guarantee lib/scanner/types.ts makes.
 *
 * Requires `npm run seed` to have been run against the live project.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const { createAdminClient } = await import("../lib/supabase/admin");
const { loadProjectForScan } = await import("../lib/scanner/queries");
const { runRuleBasedScan } = await import("../lib/scanner/rules");

const PROJECT_NAME = "Client Dashboard";

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function main() {
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

  const environmentSummary = scanned.environments
    .map((environment) => `${environment.name}=${environment.variables.length}`)
    .join(" ");
  console.log(`\nScanned "${scanned.name}" — ${environmentSummary}\n`);

  const findings = runRuleBasedScan(scanned);

  for (const finding of findings) {
    console.log(
      `  [${finding.severity.toUpperCase()}] ${finding.environmentName}/${finding.key} — ${finding.message}`,
    );
  }
  console.log("");

  check("decrypted at least one variable from the live project", scanned.environments.some((environment) => environment.variables.length > 0));

  const has = (ruleId: string, environmentName: string, key: string) =>
    findings.some(
      (finding) =>
        finding.ruleId === ruleId &&
        finding.environmentName === environmentName &&
        finding.key === key,
    );

  check(
    "planted problem 1 — live Stripe key in development",
    has("live-key-outside-production", "development", "STRIPE_SECRET_KEY"),
  );
  check(
    "planted problem 2 — JWT_SECRET under 16 characters in development",
    has("short-secret-value", "development", "JWT_SECRET"),
  );
  check(
    "planted problem 3 — NEXTAUTH_SECRET reused between staging and production",
    has("reused-value", "staging", "NEXTAUTH_SECRET") &&
      has("reused-value", "production", "NEXTAUTH_SECRET"),
  );

  // The seed deliberately parameterises every other value by project slug and
  // environment name so nothing else collides. If this fires, either the
  // duplicate rule is over-matching or the dataset has drifted.
  const reusedKeys = new Set(
    findings.filter((finding) => finding.ruleId === "reused-value").map((finding) => finding.key),
  );
  check(
    "no value other than NEXTAUTH_SECRET is reported as reused",
    reusedKeys.size === 0 || (reusedKeys.size === 1 && reusedKeys.has("NEXTAUTH_SECRET")),
    [...reusedKeys].join(", "),
  );

  check(
    "production's own live Stripe key is not flagged",
    !has("live-key-outside-production", "production", "STRIPE_SECRET_KEY"),
  );
  check(
    "NEXT_PUBLIC_APP_URL is not mistaken for a published secret",
    !findings.some((finding) => finding.ruleId === "public-secret-name"),
  );

  // The guarantee the whole design rests on, checked against real decrypted
  // values rather than fixtures: no finding may contain one.
  const serialized = JSON.stringify(findings);
  const everyValue = scanned.environments.flatMap((environment) =>
    environment.variables.map((variable) => variable.value),
  );
  const leaked = everyValue.filter((value) => value.length > 0 && serialized.includes(value));
  check(
    "no decrypted value appears anywhere in the findings",
    leaked.length === 0,
    leaked.length > 0 ? `${leaked.length} value(s) leaked` : undefined,
  );

  const failed = results.filter((result) => !result.pass);
  for (const result of results) {
    console.log(`${result.pass ? "PASS" : "FAIL"} — ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Scanner test script crashed:", error);
  process.exit(1);
});
