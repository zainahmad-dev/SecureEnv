import { describe, expect, it } from "vitest";
import {
  aiScanResponseSchema,
  assertScanPayloadIsSafe,
  buildScannerPrompt,
  buildScanPayload,
  isAiFinding,
  normalizeAiFindings,
  ScanPayloadLeakError,
  type ScanPayload,
} from "@/lib/scanner/ai";
import type { Finding, ScanEnvironment, ScanProject, ScanVariable } from "@/lib/scanner/types";

const NOW = new Date("2026-08-03T00:00:00.000Z");
const FRESH = "2026-08-01T00:00:00.000Z";

function variable(key: string, value: string, updatedAt = FRESH): ScanVariable {
  return { id: `id-${key}`, key, value, updatedAt };
}

function environment(name: string, variables: ScanVariable[]): ScanEnvironment {
  return { id: `env-${name}`, name, variables };
}

function project(environments: ScanEnvironment[]): ScanProject {
  return { id: "project-1", name: "Test Project", environments };
}

// ===========================================================================
// The payload assertion.
//
// This is the most important test in the project after the crypto tests: it
// is the proof behind the central design claim, which is that scanning a
// team's secrets with an LLM does not involve sending them anywhere. Every
// case below is written to fail if someone later widens the payload — a new
// field, a renamed field, or a value smuggled into an existing one.
// ===========================================================================

describe("no decrypted value can enter the AI payload", () => {
  const values = {
    stripe: "sk_live_UNIQUEVALUEMARKERAAA",
    short: "UNIQUEbbb",
    shared: "UNIQUEVALUEMARKERCCC-shared-between-environments",
    url: "postgres://UNIQUEuser:UNIQUEpass@db.example.com:5432/app",
    plain: "UNIQUEVALUEMARKERDDD-plain-text",
  };

  const scanned = project([
    environment("development", [
      variable("STRIPE_SECRET_KEY", values.stripe),
      variable("JWT_SECRET", values.short),
      variable("NEXTAUTH_SECRET", values.shared),
      variable("DATABASE_URL", values.url, "2020-01-01T00:00:00.000Z"),
    ]),
    environment("production", [
      variable("NEXTAUTH_SECRET", values.shared),
      variable("API_TOKEN", values.plain),
    ]),
  ]);

  it("leaks no value into the serialised payload", () => {
    const serialized = JSON.stringify(buildScanPayload(scanned, NOW));

    for (const [name, value] of Object.entries(values)) {
      expect(serialized, `${name} leaked into the payload`).not.toContain(value);
    }

    // A partial leak — the first few characters of a value, or a "masked"
    // preview — would slip past an exact-substring check.
    expect(serialized).not.toContain("UNIQUE");
  });

  it("carries exactly the fields the phase allows, and no others", () => {
    const payload = buildScanPayload(scanned, NOW);

    expect(Object.keys(payload)).toEqual(["environments"]);
    expect(Object.keys(payload.environments[0])).toEqual(["environment", "variables"]);
    expect(Object.keys(payload.environments[0].variables[0]).sort()).toEqual([
      "ageDays",
      "hasDigits",
      "hasSymbols",
      "key",
      "length",
      "looksBase64",
      "looksLikeUrl",
    ]);
  });

  it("rejects a payload that grew a value field", () => {
    // The regression the phase's own note asks for by name: if someone adds
    // a value to the payload later, this is what stops the request.
    const payload = buildScanPayload(scanned, NOW);
    Object.assign(payload.environments[0].variables[0], { value: values.stripe });

    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(ScanPayloadLeakError);
    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(/not an allowed payload field/);
  });

  it("rejects a value hidden under an innocuous field name", () => {
    // Renaming the field defeats a name-based check on its own, which is
    // why there is a second, independent one.
    const payload = buildScanPayload(scanned, NOW);
    Object.assign(payload.environments[0].variables[0], { hint: values.plain });

    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(ScanPayloadLeakError);
  });

  it("rejects a value placed into an allowed string field", () => {
    // The one case a field-name allowlist cannot catch: no new field, just
    // the wrong content in an existing one.
    const payload = buildScanPayload(scanned, NOW);
    payload.environments[0].variables[0].key = values.plain;

    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(
      /not a key or environment name/,
    );
  });

  it("rejects a value appended to a key name", () => {
    const payload = buildScanPayload(scanned, NOW);
    payload.environments[0].variables[0].key = `STRIPE_SECRET_KEY=${values.plain}`;

    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(ScanPayloadLeakError);
  });

  it("rejects an extra environment-level field", () => {
    const payload = buildScanPayload(scanned, NOW);
    Object.assign(payload.environments[0], { notes: "development" });

    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(/not an allowed payload field/);
  });

  it("rejects a nested structure smuggling a value deeper in", () => {
    const payload = buildScanPayload(scanned, NOW) as ScanPayload & { extra?: unknown };
    payload.extra = { deep: [{ deeper: values.shared }] };

    expect(() => assertScanPayloadIsSafe(payload, scanned)).toThrow(ScanPayloadLeakError);
  });

  it("rejects anything matching a known secret shape even if it were somehow allow-listed", () => {
    // The guard sweep, exercised directly: a project whose *key name* is
    // secret-shaped is not reachable through the app's key rules, so this
    // constructs the situation the last line of defence exists for.
    const leaky = project([
      environment("development", [variable("sk_live_AAAAAAAAAAAAAAAAAAAA", "x")]),
    ]);
    const payload: ScanPayload = {
      environments: [
        {
          environment: "development",
          variables: [
            {
              key: "sk_live_AAAAAAAAAAAAAAAAAAAA",
              length: 1,
              hasDigits: false,
              hasSymbols: false,
              looksBase64: false,
              looksLikeUrl: false,
              ageDays: 0,
            },
          ],
        },
      ],
    };

    expect(() => assertScanPayloadIsSafe(payload, leaky)).toThrow(/known secret shape/);
  });

  it("accepts the payload the builder actually produces", () => {
    // Guards every case above from passing because the assertion rejects
    // everything.
    expect(() => assertScanPayloadIsSafe(buildScanPayload(scanned, NOW), scanned)).not.toThrow();
  });

  it("keeps values out of the assembled prompt too", () => {
    const payload = buildScanPayload(scanned, NOW);
    const ruleFindings: Finding[] = [
      {
        ruleId: "short-secret-value",
        severity: "high",
        key: "JWT_SECRET",
        environmentName: "development",
        message: "JWT_SECRET is only 9 characters long.",
        fix: "Replace it.",
      },
    ];

    const prompt = buildScannerPrompt({ payload, ruleFindings });

    expect(prompt).not.toContain("UNIQUE");
    // …while still carrying what the model needs to be useful.
    expect(prompt).toContain("STRIPE_SECRET_KEY");
    expect(prompt).toContain("development.JWT_SECRET: short-secret-value");
  });
});

// ===========================================================================
// Payload construction
// ===========================================================================

describe("buildScanPayload", () => {
  it("reports the character count, not the value", () => {
    const payload = buildScanPayload(
      project([environment("development", [variable("API_KEY", "abcdefg")])]),
      NOW,
    );

    expect(payload.environments[0].variables[0].length).toBe(7);
  });

  it("summarises character classes coarsely", () => {
    const payload = buildScanPayload(
      project([
        environment("development", [
          variable("PLAIN", "abcdefghijklmnop"),
          variable("DIGITS", "abc123"),
          variable("SYMBOLS", "abc-def"),
          variable("ENCODED", "aGVsbG8gd29ybGQxMjM0NTY3OA"),
          variable("DATABASE_URL", "postgres://user@host:5432/db"),
        ]),
      ]),
      NOW,
    );

    const [plain, digits, symbols, encoded, url] = payload.environments[0].variables;

    expect(plain).toMatchObject({
      hasDigits: false,
      hasSymbols: false,
      looksBase64: false,
      looksLikeUrl: false,
    });
    expect(digits.hasDigits).toBe(true);
    expect(symbols.hasSymbols).toBe(true);
    expect(encoded.looksBase64).toBe(true);
    expect(url.looksLikeUrl).toBe(true);
  });

  it("does not call a long lowercase passphrase base64", () => {
    // In the alphabet, but not encoded data — telling the model otherwise
    // would make it reason about the wrong thing.
    const payload = buildScanPayload(
      project([environment("development", [variable("PASSWORD", "correcthorsebatterystaple")])]),
      NOW,
    );

    expect(payload.environments[0].variables[0].looksBase64).toBe(false);
  });

  it("reports age in whole days, and null when the timestamp is unparseable", () => {
    const payload = buildScanPayload(
      project([
        environment("development", [
          variable("RECENT", "x", "2026-08-01T00:00:00.000Z"),
          variable("BROKEN", "x", "not-a-date"),
        ]),
      ]),
      NOW,
    );

    expect(payload.environments[0].variables[0].ageDays).toBe(2);
    expect(payload.environments[0].variables[1].ageDays).toBeNull();
  });

  it("caps the number of variables so one huge project cannot blow up the prompt", () => {
    const many = Array.from({ length: 300 }, (_, index) => variable(`KEY_${index}`, "value"));
    const payload = buildScanPayload(project([environment("development", many)]), NOW);

    expect(payload.environments[0].variables).toHaveLength(250);
  });

  it("keeps an empty environment in the payload", () => {
    // "production has nothing in it" is itself a useful observation.
    const payload = buildScanPayload(
      project([environment("development", [variable("API_KEY", "x")]), environment("production", [])]),
      NOW,
    );

    expect(payload.environments).toHaveLength(2);
    expect(payload.environments[1].variables).toEqual([]);
  });
});

// ===========================================================================
// Response handling
// ===========================================================================

describe("normalizeAiFindings", () => {
  const scanned = project([
    environment("development", [
      variable("STRIPE_SECRET_KEY", "sk_test_abcdefghijklmnop"),
      variable("JWT_SECRET", "short12"),
      variable("DB_HOST", "db.example.com"),
    ]),
    environment("production", [variable("STRIPE_SECRET_KEY", "sk_live_abcdefghijklmnop")]),
  ]);
  const payload = buildScanPayload(scanned, NOW);

  function response(...findings: Record<string, string>[]) {
    return aiScanResponseSchema.parse({ findings });
  }

  const finding = (overrides: Record<string, string> = {}) => ({
    environment: "development",
    key: "DB_HOST",
    category: "naming",
    severity: "medium",
    message: "DB_HOST does not say which database it points at.",
    fix: "Rename it to PRIMARY_DB_HOST so its purpose is obvious.",
    ...overrides,
  });

  it("keeps a well-formed finding and tags it as an AI one", () => {
    const [result] = normalizeAiFindings(response(finding()), payload, []);

    expect(result.ruleId).toBe("ai-naming");
    expect(isAiFinding(result)).toBe(true);
    expect(result.severity).toBe("medium");
    expect(result.key).toBe("DB_HOST");
    expect(result.environmentName).toBe("development");
  });

  it("drops a finding about a variable that does not exist", () => {
    expect(normalizeAiFindings(response(finding({ key: "IMAGINARY_KEY" })), payload, [])).toEqual([]);
  });

  it("drops a finding about an environment that does not exist", () => {
    expect(normalizeAiFindings(response(finding({ environment: "staging" })), payload, [])).toEqual(
      [],
    );
  });

  it("drops a finding about a variable that exists, but in a different environment", () => {
    expect(normalizeAiFindings(response(finding({ environment: "production" })), payload, [])).toEqual(
      [],
    );
  });

  it("drops a finding whose severity is not one of the four", () => {
    // Severity drives the score. Coercing an unrecognised one would move a
    // number the user is meant to trust, so the row goes instead.
    expect(normalizeAiFindings(response(finding({ severity: "very high" })), payload, [])).toEqual(
      [],
    );
  });

  it("accepts a severity the model capitalised or padded", () => {
    const [result] = normalizeAiFindings(response(finding({ severity: " HIGH " })), payload, []);

    expect(result.severity).toBe("high");
  });

  it("files an unrecognised category under 'other' rather than dropping the finding", () => {
    const [result] = normalizeAiFindings(
      response(finding({ category: "vibes" })),
      payload,
      [],
    );

    expect(result.ruleId).toBe("ai-other");
  });

  it("drops a finding that claims one of the deterministic rules' categories", () => {
    // The rules are complete within their own categories — the model can
    // only agree with them or be wrong, and neither is worth a second row.
    const claims = response(
      finding({ category: "short-secret-value", key: "JWT_SECRET" }),
      finding({ category: "reused-value" }),
      finding({ category: "missing in environment" }),
    );

    expect(normalizeAiFindings(claims, payload, [])).toEqual([]);
  });

  it("drops a finding that re-derives a rule's topic on a variable that rule already flagged", () => {
    const ruleFindings: Finding[] = [
      {
        ruleId: "short-secret-value",
        severity: "high",
        key: "JWT_SECRET",
        environmentName: "development",
        message: "JWT_SECRET is only 7 characters long.",
        fix: "Replace it.",
      },
    ];

    const mislabelled = response(
      finding({
        key: "JWT_SECRET",
        category: "hygiene",
        message: "JWT_SECRET is only 7 characters, which is far too short to be safe.",
      }),
    );

    expect(normalizeAiFindings(mislabelled, payload, ruleFindings)).toEqual([]);
  });

  it("drops a cross-environment rule's topic even when the model anchors it elsewhere", () => {
    // A real live run produced exactly this: the rules reported
    // `development.RESEND_API_KEY: missing-in-environment` — anchored to the
    // environment that lacks it — and the model reported the same
    // observation from the other end, anchored to production, where it is
    // present. A topic check scoped to one environment could never see it.
    const ruleFindings: Finding[] = [
      {
        ruleId: "missing-in-environment",
        severity: "medium",
        key: "STRIPE_SECRET_KEY",
        environmentName: "development",
        message: "STRIPE_SECRET_KEY is set in production, but missing from development.",
        fix: "Add it.",
      },
    ];

    const restated = response(
      finding({
        environment: "production",
        key: "STRIPE_SECRET_KEY",
        category: "consistency",
        message: "STRIPE_SECRET_KEY is present in production but missing from development.",
      }),
    );

    expect(normalizeAiFindings(restated, payload, ruleFindings)).toEqual([]);

    // The same point in the phrasing a live run actually produced, which the
    // first version of the topic pattern let through.
    const paraphrased = response(
      finding({
        environment: "production",
        key: "STRIPE_SECRET_KEY",
        category: "consistency",
        message: "STRIPE_SECRET_KEY appears in production but not in development.",
      }),
    );

    expect(normalizeAiFindings(paraphrased, payload, ruleFindings)).toEqual([]);
  });

  it("keeps a genuinely new observation about a variable a rule already flagged", () => {
    // The topic check is scoped to the rule that fired, so it can't silence
    // the whole variable — which is the failure mode that would make the AI
    // layer pointless on exactly the variables that matter most.
    const ruleFindings: Finding[] = [
      {
        ruleId: "short-secret-value",
        severity: "high",
        key: "JWT_SECRET",
        environmentName: "development",
        message: "JWT_SECRET is only 7 characters long.",
        fix: "Replace it.",
      },
    ];

    const naming = response(
      finding({
        key: "JWT_SECRET",
        category: "naming",
        message: "JWT_SECRET does not say which service issues the token it signs.",
      }),
    );

    expect(normalizeAiFindings(naming, payload, ruleFindings)).toHaveLength(1);
  });

  it("drops a finding whose message or fix contains something secret-shaped", () => {
    // message and fix are the only free text the model controls, and they
    // render straight onto the posture panel.
    const leaky = response(
      finding({ message: "Rotate this; it currently starts sk_live_abcdefghijklmnop." }),
      finding({ key: "JWT_SECRET", fix: "Set it to sk_live_abcdefghijklmnop instead." }),
    );

    expect(normalizeAiFindings(leaky, payload, [])).toEqual([]);
  });

  it("drops a finding with an empty message or fix", () => {
    expect(normalizeAiFindings(response(finding({ message: "   " })), payload, [])).toEqual([]);
    expect(normalizeAiFindings(response(finding({ fix: "" })), payload, [])).toEqual([]);
  });

  it("deduplicates repeated findings about the same variable and category", () => {
    const repeated = response(finding(), finding({ message: "Reworded, same point." }));

    expect(normalizeAiFindings(repeated, payload, [])).toHaveLength(1);
  });

  it("caps how many findings one response can contribute", () => {
    // Each row targets a different variable, so dedupe can't collapse them
    // and the cap is what actually does the work.
    const wide = project([
      environment(
        "development",
        Array.from({ length: 40 }, (_, index) => variable(`KEY_${index}`, "value")),
      ),
    ]);
    const widePayload = buildScanPayload(wide, NOW);

    const flood = response(
      ...Array.from({ length: 40 }, (_, index) =>
        finding({ key: `KEY_${index}`, message: `Point number ${index}.` }),
      ),
    );

    expect(normalizeAiFindings(flood, widePayload, [])).toHaveLength(20);
  });

  it("collapses whitespace and truncates runaway text", () => {
    const verbose = response(
      finding({
        message: `DB_HOST\n\n   is    vague. ${"x".repeat(400)}`,
        fix: `Rename it.  ${"y".repeat(400)}`,
      }),
    );

    const [result] = normalizeAiFindings(verbose, payload, []);

    expect(result.message).not.toContain("\n");
    expect(result.message.length).toBeLessThanOrEqual(240);
    expect(result.fix.length).toBeLessThanOrEqual(300);
  });

  it("strips a value the model volunteered anyway", () => {
    // Same structural guarantee as Phase 38's generator: the schema has no
    // value field, so Zod drops it at the parse boundary, and every row is
    // rebuilt as a fresh literal afterwards.
    const parsed = aiScanResponseSchema.parse({
      findings: [{ ...finding(), value: "sk_live_abcdefghijklmnop" }],
    });

    expect(JSON.stringify(normalizeAiFindings(parsed, payload, []))).not.toContain("sk_live_");
  });
});
