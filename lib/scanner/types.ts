/**
 * The shapes the scanner works in. Kept separate from rules.ts so the AI
 * layer (Phase 40), the UI, and the persistence path can all import a
 * finding's type without pulling in the rule implementations — the same
 * split lib/audit-metadata.ts and lib/ai/guard.ts already use.
 *
 * The one thing to understand about ScanVariable: `value` is decrypted
 * plaintext. It exists in memory for the duration of a scan and nowhere
 * else. No rule may put it in a Finding, nothing persists it, nothing logs
 * it — see the note on Finding below, which is where that rule is actually
 * enforceable.
 */

export type Severity = "critical" | "high" | "medium" | "low";

/** Most severe first. Used for sorting; Phase 40 owns the numeric weighting for the score. */
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}

export type ScanVariable = {
  id: string;
  key: string;
  /**
   * Decrypted plaintext. In memory only — never persisted, never logged,
   * and never copied into a Finding.
   */
  value: string;
  /** ISO timestamp, straight from variables.updated_at. */
  updatedAt: string;
};

export type ScanEnvironment = {
  id: string;
  name: string;
  variables: ScanVariable[];
};

export type ScanProject = {
  id: string;
  name: string;
  environments: ScanEnvironment[];
};

/**
 * One problem found in one place.
 *
 * **No field here may ever contain a decrypted value.** Everything a finding
 * needs to be actionable is metadata about the value — its length, its
 * prefix shape, which keys share it — never the value itself. This is the
 * same boundary Phase 40's AI payload has to hold, drawn one layer earlier:
 * if a value can't get into a Finding, it can't reach a database row, a log
 * line, a rendered page, or a prompt downstream of one. `rules.test.ts`
 * asserts it over every rule rather than leaving it to review.
 */
export type Finding = {
  /** Stable identifier for the rule that produced this — what Phase 40 deduplicates on. */
  ruleId: string;
  severity: Severity;
  /** The variable key this is about. Key names are not secret (see the audit_logs.metadata schema comment). */
  key: string;
  environmentName: string;
  /** Other keys involved, for rules that are inherently about more than one variable. */
  relatedKeys?: string[];
  /** What's wrong, in one sentence a developer can act on. */
  message: string;
  /** What to do about it. */
  fix: string;
};
