import {
  compareSeverity,
  type Finding,
  type ScanEnvironment,
  type ScanProject,
  type ScanVariable,
} from "@/lib/scanner/types";

/**
 * The rule-based half of the security scanner.
 *
 * Every check in this file is a regex or a comparison — no model, no network
 * call, no dependency beyond the standard library. That is the point: the
 * highest-value findings this product makes are the deterministic ones, and
 * the AI layer (Phase 40) exists to add what rules genuinely can't, not to
 * re-derive what's already here.
 *
 * Two constraints hold throughout:
 *
 * 1. **Pure.** Rules take already-decrypted variables and return findings.
 *    They never fetch, never write, never log. Decryption happens in
 *    lib/scanner/queries.ts and the plaintext lives only in the ScanProject
 *    passed in here.
 * 2. **No value ever leaves in a Finding.** Rules read values freely — that's
 *    their job — but only ever emit metadata about them: a length, a prefix
 *    shape, the fact that two keys match. See the note on Finding in
 *    types.ts; rules.test.ts asserts it across every rule.
 */

/** The spec's own pattern, verbatim. Keys are uppercase by construction (lib/variables/key.ts), so a case-sensitive match is exact rather than lax. */
const SECRET_NAME_PATTERN = /SECRET|KEY|TOKEN|PASSWORD/;

const MIN_SECRET_LENGTH = 16;
const STALE_AFTER_DAYS = 180;
const PRODUCTION = "production";

/** NEXT_PUBLIC_ is Next.js inlining the value into the browser bundle at build time — see lib/variables/key.ts. */
const PUBLIC_PREFIX = "NEXT_PUBLIC_";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function looksLikeSecretName(key: string): boolean {
  return SECRET_NAME_PATTERN.test(key);
}

function daysSince(iso: string, now: Date): number | null {
  const then = new Date(iso).getTime();
  // A row with an unparseable timestamp is a data problem, not a security
  // finding — reporting it as "stale" would be a guess dressed up as a fact.
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

/** `production` is the only name that carries production semantics; every custom environment (preview, qa, …) is treated as non-production. */
function isProduction(environmentName: string): boolean {
  return environmentName === PRODUCTION;
}

// ---------------------------------------------------------------------------
// Per-environment rules
// ---------------------------------------------------------------------------

/** A value short enough to brute-force, under a key whose name says it holds a secret. */
export function shortSecretValues(environment: ScanEnvironment): Finding[] {
  return environment.variables
    .filter(
      (variable) => looksLikeSecretName(variable.key) && variable.value.length < MIN_SECRET_LENGTH,
    )
    .map((variable) => ({
      ruleId: "short-secret-value",
      severity: "high" as const,
      key: variable.key,
      environmentName: environment.name,
      // The length, never the value. Phase 40's AI payload draws the same
      // line for the same reason.
      message: `${variable.key} is only ${variable.value.length} characters long.`,
      fix: `Replace it with at least ${MIN_SECRET_LENGTH} characters of cryptographically random data — a short secret is guessable regardless of how it is stored.`,
    }));
}

/**
 * A live Stripe key outside production. Critical rather than high: a live
 * key in development is readable by everyone with development access, which
 * is normally a much wider group than production, and it can move real
 * money.
 */
export function liveKeyOutsideProduction(environment: ScanEnvironment): Finding[] {
  if (isProduction(environment.name)) return [];

  return environment.variables
    .filter((variable) => /^sk_live_/.test(variable.value))
    .map((variable) => ({
      ruleId: "live-key-outside-production",
      severity: "critical" as const,
      key: variable.key,
      environmentName: environment.name,
      message: `${variable.key} holds a live Stripe secret key, but this is the ${environment.name} environment.`,
      fix: "Swap in a test-mode key and rotate the live one — it has been readable by everyone with access to this environment.",
    }));
}

/** The mirror image: a test-mode key in production, which means production isn't doing anything real. */
export function testKeyInProduction(environment: ScanEnvironment): Finding[] {
  if (!isProduction(environment.name)) return [];

  return environment.variables
    .filter((variable) => /^sk_test_/.test(variable.value))
    .map((variable) => ({
      ruleId: "test-key-in-production",
      severity: "high" as const,
      key: variable.key,
      environmentName: environment.name,
      message: `${variable.key} holds a Stripe test-mode key in production.`,
      fix: "Replace it with the live key. Until then, production is silently transacting against Stripe's test mode.",
    }));
}

/**
 * A key that is published to the browser by its prefix, yet named as though
 * it holds a secret. Critical because it isn't a risk of exposure — if the
 * value really is a secret, it is already in every visitor's page source.
 */
export function publicSecretNames(environment: ScanEnvironment): Finding[] {
  return environment.variables
    .filter(
      (variable) => variable.key.startsWith(PUBLIC_PREFIX) && looksLikeSecretName(variable.key),
    )
    .map((variable) => ({
      ruleId: "public-secret-name",
      severity: "critical" as const,
      key: variable.key,
      environmentName: environment.name,
      message: `${variable.key} is inlined into the browser bundle by its ${PUBLIC_PREFIX} prefix, but its name says it holds a secret.`,
      fix: `If the value is secret, drop the ${PUBLIC_PREFIX} prefix, move it server-side, and rotate it — assume it is already public. If it genuinely isn't secret, rename it so the name stops implying otherwise.`,
    }));
}

/** A value nobody has rotated in a long time. Low severity — age alone is a smell, not a breach. */
export function staleVariables(environment: ScanEnvironment, now: Date = new Date()): Finding[] {
  const findings: Finding[] = [];

  for (const variable of environment.variables) {
    const age = daysSince(variable.updatedAt, now);
    if (age === null || age <= STALE_AFTER_DAYS) continue;

    findings.push({
      ruleId: "stale-variable",
      severity: "low",
      key: variable.key,
      environmentName: environment.name,
      message: `${variable.key} has not changed in ${age} days.`,
      fix: "Rotate it, or confirm it is deliberately long-lived. A secret that outlives the people who have seen it is the usual way old access lingers.",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Project-level rules
//
// The last two checks in the phase's list cannot be per-environment even in
// principle — "the same value used by two or more variables" and "a key
// missing from another environment in the same project" are both statements
// about a set of environments, and a function handed one environment has no
// way to see the others. They take the whole project instead.
// ---------------------------------------------------------------------------

type Occurrence = { environment: ScanEnvironment; variable: ScanVariable };

/** `staging.NEXTAUTH_SECRET` — enough to find the other copy, and free of anything sensitive. */
function locate(occurrence: Occurrence): string {
  return `${occurrence.environment.name}.${occurrence.variable.key}`;
}

/**
 * The same value in two or more places.
 *
 * Grouped across the whole project rather than within one environment, which
 * covers both shapes this takes in practice: two variables in one
 * environment sharing a value, and — the more damaging one — the same secret
 * copied between environments, where a leak in the loosest environment
 * silently unlocks the strictest.
 *
 * One finding per occurrence, so the problem surfaces on every environment
 * it affects rather than only the first one scanned.
 */
export function duplicateValues(project: ScanProject): Finding[] {
  const byValue = new Map<string, Occurrence[]>();

  for (const environment of project.environments) {
    for (const variable of environment.variables) {
      // An empty value isn't a shared secret, it's an unset variable — every
      // blank would otherwise "match" every other blank.
      if (variable.value === "") continue;

      const group = byValue.get(variable.value);
      if (group) group.push({ environment, variable });
      else byValue.set(variable.value, [{ environment, variable }]);
    }
  }

  const findings: Finding[] = [];

  for (const occurrences of byValue.values()) {
    if (occurrences.length < 2) continue;

    // A value shared with production is worse than one shared between two
    // throwaway environments: whichever copy leaks, production is the one
    // that pays for it.
    const touchesProduction = occurrences.some((occurrence) =>
      isProduction(occurrence.environment.name),
    );

    for (const occurrence of occurrences) {
      const others = occurrences.filter((candidate) => candidate !== occurrence);

      findings.push({
        ruleId: "reused-value",
        severity: touchesProduction ? "critical" : "high",
        key: occurrence.variable.key,
        environmentName: occurrence.environment.name,
        relatedKeys: others.map(locate),
        message: `${occurrence.variable.key} shares its value with ${others.map(locate).join(", ")}.`,
        fix: "Generate a separate value for each one. Sharing a secret means a leak anywhere is a leak everywhere it was copied to.",
      });
    }
  }

  return findings;
}

/**
 * A key set in some environments but not others — usually a variable added
 * to development and never promoted, which surfaces as a runtime crash the
 * first time production takes that code path.
 *
 * One finding per (missing key, environment that lacks it), so it appears on
 * the environment where something actually needs adding. Environments with
 * no variables at all are skipped: one that has never been set up would
 * otherwise report every key in the project, which is noise rather than
 * drift.
 */
export function missingKeysAcrossEnvironments(project: ScanProject): Finding[] {
  const populated = project.environments.filter(
    (environment) => environment.variables.length > 0,
  );
  if (populated.length < 2) return [];

  const keyLocations = new Map<string, string[]>();
  for (const environment of populated) {
    for (const variable of environment.variables) {
      const locations = keyLocations.get(variable.key);
      if (locations) locations.push(environment.name);
      else keyLocations.set(variable.key, [environment.name]);
    }
  }

  const findings: Finding[] = [];

  for (const environment of populated) {
    const present = new Set(environment.variables.map((variable) => variable.key));

    for (const [key, locations] of keyLocations) {
      if (present.has(key)) continue;

      findings.push({
        ruleId: "missing-in-environment",
        severity: "medium",
        key,
        environmentName: environment.name,
        relatedKeys: locations.map((name) => `${name}.${key}`),
        message: `${key} is set in ${locations.join(" and ")}, but missing from ${environment.name}.`,
        fix: `Add ${key} here, or remove it from the other environments if it is genuinely no longer needed. Anything reading it will fail at runtime in ${environment.name}.`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------

export const ENVIRONMENT_RULES = [
  shortSecretValues,
  liveKeyOutsideProduction,
  testKeyInProduction,
  publicSecretNames,
] as const;

export const PROJECT_RULES = [duplicateValues, missingKeysAcrossEnvironments] as const;

/**
 * Every rule, over one project's decrypted variables, sorted most severe
 * first and then by environment and key so two runs over the same data
 * produce byte-identical output — which is what makes the Phase 40 merge and
 * the persisted scan row comparable between runs.
 *
 * `now` is injected rather than read inside staleVariables so the 180-day
 * rule is testable without waiting six months or mutating the system clock.
 */
export function runRuleBasedScan(project: ScanProject, now: Date = new Date()): Finding[] {
  const findings: Finding[] = [];

  for (const environment of project.environments) {
    for (const rule of ENVIRONMENT_RULES) {
      findings.push(...rule(environment));
    }
    findings.push(...staleVariables(environment, now));
  }

  for (const rule of PROJECT_RULES) {
    findings.push(...rule(project));
  }

  return findings.sort(
    (a, b) =>
      compareSeverity(a.severity, b.severity) ||
      a.environmentName.localeCompare(b.environmentName) ||
      a.key.localeCompare(b.key) ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
