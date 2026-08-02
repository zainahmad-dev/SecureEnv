import { describe, expect, it } from "vitest";
import {
  duplicateValues,
  liveKeyOutsideProduction,
  missingKeysAcrossEnvironments,
  publicSecretNames,
  runRuleBasedScan,
  shortSecretValues,
  staleVariables,
  testKeyInProduction,
} from "@/lib/scanner/rules";
import type { ScanEnvironment, ScanProject, ScanVariable } from "@/lib/scanner/types";

const NOW = new Date("2026-08-02T00:00:00.000Z");
const FRESH = "2026-08-01T00:00:00.000Z";

function variable(key: string, value: string, updatedAt = FRESH): ScanVariable {
  return { id: `id-${key}-${updatedAt}`, key, value, updatedAt };
}

function environment(name: string, variables: ScanVariable[]): ScanEnvironment {
  return { id: `env-${name}`, name, variables };
}

function project(environments: ScanEnvironment[]): ScanProject {
  return { id: "project-1", name: "Test Project", environments };
}

/** Long enough to pass the 16-character rule, so fixtures only trip the rule under test. */
const LONG = "a-perfectly-long-enough-value";

describe("shortSecretValues", () => {
  it("flags a value under 16 characters whose key looks like a secret", () => {
    const findings = shortSecretValues(environment("development", [variable("JWT_SECRET", "short12")]));

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("short-secret-value");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].message).toContain("7 characters");
  });

  it("accepts a value of exactly 16 characters", () => {
    // The rule is "shorter than 16", so the boundary itself must pass —
    // this is the assertion that catches a `<=` typo.
    expect(shortSecretValues(environment("development", [variable("API_KEY", "0123456789abcdef")]))).toEqual([]);
  });

  it("ignores a short value under a key that does not look like a secret", () => {
    expect(shortSecretValues(environment("development", [variable("PORT", "3000")]))).toEqual([]);
  });

  it("matches every word in the pattern", () => {
    const env = environment("development", [
      variable("APP_SECRET", "x"),
      variable("API_KEY", "x"),
      variable("AUTH_TOKEN", "x"),
      variable("DB_PASSWORD", "x"),
    ]);

    expect(shortSecretValues(env)).toHaveLength(4);
  });
});

describe("liveKeyOutsideProduction", () => {
  it("flags a live Stripe key in development", () => {
    const findings = liveKeyOutsideProduction(
      environment("development", [variable("STRIPE_SECRET_KEY", "sk_live_FAKEKEYNOTREAL")]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("flags it in a custom environment too", () => {
    // Anything that isn't literally "production" is non-production, so a
    // custom "preview" environment is covered without naming it anywhere.
    const findings = liveKeyOutsideProduction(
      environment("preview", [variable("STRIPE_SECRET_KEY", "sk_live_FAKEKEYNOTREAL")]),
    );

    expect(findings).toHaveLength(1);
  });

  it("says nothing about a live key in production", () => {
    expect(
      liveKeyOutsideProduction(
        environment("production", [variable("STRIPE_SECRET_KEY", "sk_live_FAKEKEYNOTREAL")]),
      ),
    ).toEqual([]);
  });

  it("only matches at the start of the value", () => {
    // A value that merely mentions the prefix is not a live key.
    expect(
      liveKeyOutsideProduction(
        environment("development", [variable("NOTES", "rotate the sk_live_ key next week")]),
      ),
    ).toEqual([]);
  });
});

describe("testKeyInProduction", () => {
  it("flags a test key in production", () => {
    const findings = testKeyInProduction(
      environment("production", [variable("STRIPE_SECRET_KEY", "sk_test_FAKEKEYNOTREAL")]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
  });

  it("says nothing about a test key outside production", () => {
    expect(
      testKeyInProduction(
        environment("staging", [variable("STRIPE_SECRET_KEY", "sk_test_FAKEKEYNOTREAL")]),
      ),
    ).toEqual([]);
  });
});

describe("publicSecretNames", () => {
  it("flags a NEXT_PUBLIC_ key whose name also looks like a secret", () => {
    const findings = publicSecretNames(
      environment("production", [variable("NEXT_PUBLIC_API_KEY", LONG)]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("leaves an ordinary public variable alone", () => {
    // NEXT_PUBLIC_APP_URL is in the seed data for every environment — if
    // this rule flagged it, every scan would open with a false positive.
    expect(publicSecretNames(environment("production", [variable("NEXT_PUBLIC_APP_URL", LONG)]))).toEqual([]);
  });

  it("leaves a secret-named key without the prefix alone", () => {
    expect(publicSecretNames(environment("production", [variable("STRIPE_SECRET_KEY", LONG)]))).toEqual([]);
  });
});

describe("staleVariables", () => {
  it("flags a variable older than 180 days", () => {
    const findings = staleVariables(
      environment("production", [variable("DATABASE_URL", LONG, "2025-01-01T00:00:00.000Z")]),
      NOW,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].message).toMatch(/has not changed in \d+ days/);
  });

  it("says nothing at exactly 180 days", () => {
    const updatedAt = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    expect(staleVariables(environment("production", [variable("DATABASE_URL", LONG, updatedAt)]), NOW)).toEqual([]);
  });

  it("flags at 181 days", () => {
    const updatedAt = new Date(NOW.getTime() - 181 * 24 * 60 * 60 * 1000).toISOString();
    expect(staleVariables(environment("production", [variable("DATABASE_URL", LONG, updatedAt)]), NOW)).toHaveLength(1);
  });

  it("ignores a variable with an unparseable timestamp rather than guessing", () => {
    expect(staleVariables(environment("production", [variable("DATABASE_URL", LONG, "not-a-date")]), NOW)).toEqual([]);
  });
});

describe("duplicateValues", () => {
  it("flags the same value reused across two environments, once per occurrence", () => {
    const findings = duplicateValues(
      project([
        environment("staging", [variable("NEXTAUTH_SECRET", "reused-fake-secret-across-envs")]),
        environment("production", [variable("NEXTAUTH_SECRET", "reused-fake-secret-across-envs")]),
      ]),
    );

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.environmentName).sort()).toEqual(["production", "staging"]);
    // Production is involved, so the shared value is worse than a pair of
    // throwaway environments sharing one.
    expect(findings.every((finding) => finding.severity === "critical")).toBe(true);
    expect(findings[0].relatedKeys).toEqual(["production.NEXTAUTH_SECRET"]);
  });

  it("drops to high when production is not involved", () => {
    const findings = duplicateValues(
      project([
        environment("development", [variable("A_SECRET", "shared-value-between-envs")]),
        environment("staging", [variable("B_SECRET", "shared-value-between-envs")]),
      ]),
    );

    expect(findings.every((finding) => finding.severity === "high")).toBe(true);
  });

  it("flags two variables sharing a value inside one environment", () => {
    const findings = duplicateValues(
      project([
        environment("development", [
          variable("JWT_SECRET", "shared-value-between-vars"),
          variable("SESSION_SECRET", "shared-value-between-vars"),
        ]),
      ]),
    );

    expect(findings).toHaveLength(2);
  });

  it("says nothing when every value differs", () => {
    const findings = duplicateValues(
      project([
        environment("development", [variable("A_SECRET", "one-distinct-value")]),
        environment("staging", [variable("A_SECRET", "another-distinct-value")]),
      ]),
    );

    expect(findings).toEqual([]);
  });

  it("does not treat two empty values as a shared secret", () => {
    const findings = duplicateValues(
      project([
        environment("development", [variable("A_SECRET", "")]),
        environment("staging", [variable("B_SECRET", "")]),
      ]),
    );

    expect(findings).toEqual([]);
  });
});

describe("missingKeysAcrossEnvironments", () => {
  it("flags a key present in two environments but missing from a third", () => {
    const findings = missingKeysAcrossEnvironments(
      project([
        environment("development", [variable("DATABASE_URL", LONG)]),
        environment("staging", [variable("DATABASE_URL", LONG), variable("RESEND_API_KEY", LONG)]),
        environment("production", [variable("DATABASE_URL", LONG), variable("RESEND_API_KEY", LONG)]),
      ]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("RESEND_API_KEY");
    expect(findings[0].environmentName).toBe("development");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].message).toContain("staging and production");
  });

  it("says nothing when every environment holds the same keys", () => {
    const findings = missingKeysAcrossEnvironments(
      project([
        environment("development", [variable("DATABASE_URL", LONG)]),
        environment("production", [variable("DATABASE_URL", LONG)]),
      ]),
    );

    expect(findings).toEqual([]);
  });

  it("skips an environment that has no variables at all", () => {
    // A brand-new environment nobody has filled in yet would otherwise
    // report every key in the project — noise, not drift.
    const findings = missingKeysAcrossEnvironments(
      project([
        environment("development", [variable("DATABASE_URL", LONG), variable("JWT_SECRET", LONG)]),
        environment("production", [variable("DATABASE_URL", LONG), variable("JWT_SECRET", LONG)]),
        environment("preview", []),
      ]),
    );

    expect(findings).toEqual([]);
  });

  it("needs at least two populated environments to say anything", () => {
    const findings = missingKeysAcrossEnvironments(
      project([environment("development", [variable("DATABASE_URL", LONG)])]),
    );

    expect(findings).toEqual([]);
  });
});

describe("runRuleBasedScan", () => {
  /** The three problems scripts/seed.ts deliberately plants in "Client Dashboard". */
  const seededProject = project([
    environment("development", [
      variable("STRIPE_SECRET_KEY", "sk_live_FAKE_client-dashboard_development_DO_NOT_USE"),
      variable("JWT_SECRET", "short12"),
      variable("NEXTAUTH_SECRET", "demo-nextauth-secret-client-dashboard-development-not-real"),
    ]),
    environment("staging", [
      variable("STRIPE_SECRET_KEY", "sk_test_FAKE_client-dashboard_staging_DO_NOT_USE"),
      variable("JWT_SECRET", "demo-jwt-secret-client-dashboard-staging-not-real"),
      variable("NEXTAUTH_SECRET", "reused-fake-secret-across-envs-warning"),
    ]),
    environment("production", [
      variable("STRIPE_SECRET_KEY", "sk_live_FAKE_client-dashboard_production_DO_NOT_USE"),
      variable("JWT_SECRET", "demo-jwt-secret-client-dashboard-production-not-real"),
      variable("NEXTAUTH_SECRET", "reused-fake-secret-across-envs-warning"),
    ]),
  ]);

  it("finds all three planted problems and nothing else", () => {
    const findings = runRuleBasedScan(seededProject, NOW);
    const ids = findings.map((finding) => `${finding.ruleId}:${finding.environmentName}:${finding.key}`);

    expect(ids).toContain("live-key-outside-production:development:STRIPE_SECRET_KEY");
    expect(ids).toContain("short-secret-value:development:JWT_SECRET");
    expect(ids).toContain("reused-value:staging:NEXTAUTH_SECRET");
    expect(ids).toContain("reused-value:production:NEXTAUTH_SECRET");
    expect(findings).toHaveLength(4);
  });

  it("sorts most severe first", () => {
    const findings = runRuleBasedScan(seededProject, NOW);
    expect(findings[0].severity).toBe("critical");
    expect(findings.at(-1)!.severity).toBe("high");
  });

  it("is deterministic across runs", () => {
    expect(runRuleBasedScan(seededProject, NOW)).toEqual(runRuleBasedScan(seededProject, NOW));
  });
});

/**
 * The assertion that matters most in this file, and the one worth keeping
 * for an interview: rules read decrypted values, so the only thing standing
 * between a value and a database row / log line / rendered page / AI prompt
 * is that no rule ever copies one into a Finding. This checks every rule at
 * once, over values distinctive enough that a substring match can't miss.
 */
describe("no finding ever contains a decrypted value", () => {
  const values = {
    live: "sk_live_UNIQUEVALUEMARKERAAA",
    test: "sk_test_UNIQUEVALUEMARKERBBB",
    short: "UNIQUEccc",
    shared: "UNIQUEVALUEMARKERDDD-shared-between-environments",
    stale: "UNIQUEVALUEMARKEREEE-long-enough-to-pass",
    publicish: "UNIQUEVALUEMARKERFFF-long-enough-to-pass",
  };

  const everyRuleFires = project([
    environment("development", [
      variable("STRIPE_SECRET_KEY", values.live),
      variable("JWT_SECRET", values.short),
      variable("NEXTAUTH_SECRET", values.shared),
      variable("NEXT_PUBLIC_API_KEY", values.publicish),
      variable("DATABASE_URL", values.stale, "2020-01-01T00:00:00.000Z"),
    ]),
    environment("production", [
      variable("STRIPE_SECRET_KEY", values.test),
      variable("NEXTAUTH_SECRET", values.shared),
    ]),
  ]);

  it("fires a representative spread of rules on this fixture", () => {
    // Guards the test below from silently passing because nothing ran.
    const ruleIds = new Set(runRuleBasedScan(everyRuleFires, NOW).map((finding) => finding.ruleId));

    expect(ruleIds).toEqual(
      new Set([
        "live-key-outside-production",
        "short-secret-value",
        "public-secret-name",
        "stale-variable",
        "test-key-in-production",
        "reused-value",
        "missing-in-environment",
      ]),
    );
  });

  it("leaks no value into any message, fix, key, or relatedKeys", () => {
    const findings = runRuleBasedScan(everyRuleFires, NOW);
    const serialized = JSON.stringify(findings);

    for (const [name, value] of Object.entries(values)) {
      expect(serialized, `${name} leaked into a finding`).not.toContain(value);
    }

    // Also catch a partial leak — a rule that emitted only the first few
    // characters of a value would slip past an exact-substring check.
    expect(serialized).not.toContain("UNIQUE");
  });
});
