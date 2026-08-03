import { describe, expect, it } from "vitest";
import {
  groupFindingsByEnvironment,
  mergeFindings,
  scoreFindings,
  SEVERITY_WEIGHTS,
} from "@/lib/scanner/scan";
import type { Finding, ScanEnvironment, ScanProject, ScanVariable, Severity } from "@/lib/scanner/types";

function finding(
  severity: Severity,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    ruleId: "short-secret-value",
    severity,
    key: "JWT_SECRET",
    environmentName: "development",
    message: "message",
    fix: "fix",
    ...overrides,
  };
}

function variable(key: string): ScanVariable {
  return { id: `id-${key}`, key, value: "value", updatedAt: "2026-08-01T00:00:00.000Z" };
}

function environment(name: string, variables: ScanVariable[]): ScanEnvironment {
  return { id: `env-${name}`, name, variables };
}

function project(environments: ScanEnvironment[]): ScanProject {
  return { id: "project-1", name: "Test Project", environments };
}

describe("scoreFindings", () => {
  it("scores a clean environment 100", () => {
    expect(scoreFindings([])).toBe(100);
  });

  it("subtracts each finding's severity weight", () => {
    expect(scoreFindings([finding("critical")])).toBe(100 - SEVERITY_WEIGHTS.critical);
    expect(scoreFindings([finding("high"), finding("low")])).toBe(
      100 - SEVERITY_WEIGHTS.high - SEVERITY_WEIGHTS.low,
    );
  });

  it("lets severity outweigh count", () => {
    // The bias that makes the number trustworthy: one critical is worse than
    // a pile of lows, not the other way round.
    const oneCritical = scoreFindings([finding("critical")]);
    const fiveLows = scoreFindings(Array.from({ length: 5 }, () => finding("low")));

    expect(oneCritical).toBeLessThan(fiveLows);
  });

  it("floors at zero rather than going negative", () => {
    const disaster = Array.from({ length: 10 }, () => finding("critical"));

    expect(scoreFindings(disaster)).toBe(0);
  });

  it("stays within 0–100 for every severity", () => {
    for (const severity of ["critical", "high", "medium", "low"] as Severity[]) {
      const score = scoreFindings([finding(severity)]);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("mergeFindings", () => {
  it("combines both layers", () => {
    const rules = [finding("high")];
    const ai = [finding("medium", { ruleId: "ai-naming", key: "DB_HOST" })];

    expect(mergeFindings(rules, ai)).toHaveLength(2);
  });

  it("removes duplicates sharing an environment, key, and rule id", () => {
    const duplicate = finding("high");

    expect(mergeFindings([duplicate], [{ ...duplicate }])).toHaveLength(1);
  });

  it("keeps the deterministic finding when identities collide", () => {
    const rule = finding("high", { message: "from the rules" });
    const ai = finding("low", { message: "from the model" });

    expect(mergeFindings([rule], [ai])[0].message).toBe("from the rules");
  });

  it("does not treat two rules on the same variable as duplicates", () => {
    const short = finding("high", { ruleId: "short-secret-value" });
    const stale = finding("low", { ruleId: "stale-variable" });

    expect(mergeFindings([short, stale], [])).toHaveLength(2);
  });

  it("sorts most severe first", () => {
    const merged = mergeFindings(
      [finding("low", { ruleId: "stale-variable" }), finding("critical", { ruleId: "public-secret-name" })],
      [finding("medium", { ruleId: "ai-naming" })],
    );

    expect(merged.map((item) => item.severity)).toEqual(["critical", "medium", "low"]);
  });
});

describe("groupFindingsByEnvironment", () => {
  const scanned = project([
    environment("development", [variable("JWT_SECRET"), variable("DB_HOST")]),
    environment("production", [variable("JWT_SECRET")]),
    environment("staging", []),
  ]);

  it("puts each finding on the environment it names", () => {
    const results = groupFindingsByEnvironment(scanned, [
      finding("high", { environmentName: "development" }),
      finding("critical", { environmentName: "production" }),
    ]);

    expect(results[0].findings).toHaveLength(1);
    expect(results[1].findings).toHaveLength(1);
  });

  it("scores each environment from its own findings only", () => {
    const results = groupFindingsByEnvironment(scanned, [
      finding("critical", { environmentName: "development" }),
    ]);

    expect(results[0].score).toBe(60);
    expect(results[1].score).toBe(100);
  });

  it("scores an environment with no variables as null, not zero and not 100", () => {
    // Phase 41 renders this as a neutral placeholder. Subtractive scoring
    // would hand an untouched production environment a spotless 100, which
    // is vacuous rather than true.
    const results = groupFindingsByEnvironment(scanned, []);

    expect(results[2].environmentName).toBe("staging");
    expect(results[2].score).toBeNull();
    expect(results[2].variableCount).toBe(0);
  });

  it("reports every environment, including ones with nothing wrong", () => {
    const results = groupFindingsByEnvironment(scanned, []);

    expect(results.map((result) => result.environmentName)).toEqual([
      "development",
      "production",
      "staging",
    ]);
  });
});
