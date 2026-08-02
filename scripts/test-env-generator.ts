/**
 * Phase 38 .env generator smoke test — the phase's literal "Done when":
 * picking three services returns a correct key list.
 *
 * Run: npm run test:generator
 *
 * Makes one real call to the live Groq API (free tier), like
 * scripts/test-ai.ts. It deliberately calls generateEnvSuggestions() rather
 * than the server action that wraps it: the action's auth check and rate
 * limiter need a real request context, and neither is what this script is
 * trying to prove. What it proves is that the model, prompt, schema, and
 * normalizer together produce a usable list of variable *names* — and that
 * no value comes back with them.
 *
 * Model output varies run to run, so each service is checked against the
 * handful of names that service's own docs actually use, not one exact
 * string. A stricter assertion here would fail on a correct answer.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

// Deferred until after dotenv has loaded, same reasoning as scripts/test-ai.ts.
const { generateEnvSuggestions } = await import("../lib/ai/generator/generate");
const { containsSecretLikeContent, PromptContainsSecretError } = await import("../lib/ai/guard");
const { KEY_PATTERN } = await import("../lib/variables/key");

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

/** Each service is satisfied if any one of its accepted names comes back. */
const EXPECTED: Record<string, string[]> = {
  Stripe: ["STRIPE_SECRET_KEY", "STRIPE_API_KEY"],
  Supabase: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
  Resend: ["RESEND_API_KEY"],
};

async function testThreeServices() {
  const services = Object.keys(EXPECTED);

  let suggestions;
  try {
    suggestions = await generateEnvSuggestions({ services });
  } catch (error) {
    check("generateEnvSuggestions returns a key list for three services", false, error instanceof Error ? error.message : String(error));
    return;
  }

  const keys = suggestions.map((suggestion) => suggestion.key);
  console.log(`\nReturned ${keys.length} keys: ${keys.join(", ")}\n`);

  check("generateEnvSuggestions returns a key list for three services", suggestions.length > 0, `${suggestions.length} suggestions`);

  for (const [service, accepted] of Object.entries(EXPECTED)) {
    const hit = accepted.find((key) => keys.includes(key));
    check(`${service} is represented`, Boolean(hit), hit ?? `expected one of ${accepted.join(" / ")}`);
  }

  check(
    "every key is one the app would accept in its own add-variable form",
    keys.every((key) => KEY_PATTERN.test(key)),
    keys.filter((key) => !KEY_PATTERN.test(key)).join(", ") || undefined,
  );

  check("no key is returned twice", new Set(keys).size === keys.length);

  check(
    "every suggestion carries only key/service/description/visibility",
    suggestions.every(
      (suggestion) =>
        Object.keys(suggestion).sort().join(",") === "description,key,service,visibility",
    ),
  );

  check(
    "no description contains anything shaped like a live secret",
    suggestions.every((suggestion) => !containsSecretLikeContent(suggestion.description)),
  );

  check(
    "every NEXT_PUBLIC_ key is marked public",
    suggestions
      .filter((suggestion) => suggestion.key.startsWith("NEXT_PUBLIC_"))
      .every((suggestion) => suggestion.visibility === "public"),
  );
}

async function testNotesWithASecretAreRefused() {
  // Same fixture shape as scripts/test-ai.ts — right prefix, deliberately
  // shorter than a real Stripe key so GitHub's push protection doesn't read
  // it as one. No network call happens: the guard runs inside callAI()
  // before the API key is even read.
  try {
    await generateEnvSuggestions({
      services: ["Stripe"],
      notes: "Our current key is sk_live_FAKEKEYNOTREAL, match that format.",
    });
    check("notes containing a secret are refused before any request", false, "no error thrown");
  } catch (error) {
    check(
      "notes containing a secret are refused before any request",
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

  await testNotesWithASecretAreRefused();
  await testThreeServices();

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
  console.error("Generator test script crashed:", error);
  process.exit(1);
});
