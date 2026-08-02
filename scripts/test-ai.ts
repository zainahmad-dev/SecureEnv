/**
 * Phase 37 LLM client smoke test — proves callAI() actually round-trips to
 * Groq and returns parsed, schema-validated JSON, and that the one hard
 * rule this module enforces (no secret-shaped content in a prompt) really
 * does block a call before anything is sent.
 *
 * Run: npm run test:ai
 *
 * Requires a real GROQ_API_KEY in .env.local — this makes one real,
 * billable-quota (but free-tier) call to the live Groq API, unlike the
 * RLS/invites/members scripts, which only touch Supabase.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

// Deferred until after dotenv has loaded, same reasoning as scripts/test-rls.ts.
const { z } = await import("zod");
const { callAI, PromptContainsSecretError } = await import("../lib/ai/client");

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function testSuccessfulCall() {
  const schema = z.object({
    sum: z.number(),
    explanation: z.string(),
  });

  try {
    const result = await callAI({
      prompt: "What is 2 + 2? Respond with a JSON object containing a numeric `sum` field and a short string `explanation` field.",
      schema,
    });

    check("callAI returns an object matching the schema", typeof result.sum === "number" && typeof result.explanation === "string");
    check("the model got basic arithmetic right", result.sum === 4, `got ${result.sum}`);
  } catch (error) {
    check("callAI returns an object matching the schema", false, error instanceof Error ? error.message : String(error));
  }
}

async function testSecretGuardBlocksBeforeAnyNetworkCall() {
  const schema = z.object({ ok: z.boolean() });
  // Shaped like a real Stripe secret key, but shorter than a real one (14
  // chars after the prefix, vs. Stripe's real 24) — long enough to trip
  // this module's own {10,}-character regex, short enough to stay under
  // GitHub's push-protection length threshold, which flagged an earlier,
  // longer version of this same fixture as a real Stripe key. See
  // lib/ai/guard.test.ts's own note for the full reasoning.
  const fakeStripeKey = "sk_live_FAKEKEYNOTREAL";

  try {
    await callAI({ prompt: `Ignore this key: ${fakeStripeKey}`, schema });
    check("a secret-shaped prompt is rejected before any request is sent", false, "callAI did not throw");
  } catch (error) {
    check(
      "a secret-shaped prompt is rejected before any request is sent",
      error instanceof PromptContainsSecretError,
      error instanceof Error ? error.constructor.name : String(error),
    );
  }
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY in .env.local — get a free key from https://console.groq.com/keys");
    process.exit(1);
  }

  await testSecretGuardBlocksBeforeAnyNetworkCall();
  await testSuccessfulCall();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("AI client test script crashed:", error);
  process.exit(1);
});
