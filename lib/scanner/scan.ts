import type { SupabaseClient } from "@supabase/supabase-js";
import { AIClientError, PromptContainsSecretError } from "@/lib/ai/client";
import { runAiScan, ScanPayloadLeakError } from "@/lib/scanner/ai";
import { loadProjectForScan } from "@/lib/scanner/queries";
import { runRuleBasedScan, sortFindings } from "@/lib/scanner/rules";
import type { Finding, ScanProject, Severity } from "@/lib/scanner/types";
import type { Database, Json } from "@/types/database";

/**
 * One scan, end to end: load and decrypt, run the rules, ask the model for
 * what the rules can't see, merge, score, persist.
 *
 * Split out of ai.ts so that file stays about the payload boundary and this
 * one is about assembling a result — and so the pure parts here (merge,
 * dedupe, score) can be unit-tested without a database or a network call,
 * the same split lib/scanner/rules.ts and queries.ts already use.
 */

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * What each finding costs out of 100.
 *
 * Subtractive and flat rather than a curve, because the number has to be
 * explainable: "one critical costs you 40 points" is something a developer
 * can hold in their head and predict, and a posture score nobody can predict
 * gets ignored. The weights are spaced so severity dominates count — a
 * single critical (40) outweighs any five lows (15), which is the correct
 * bias for a security score. Two criticals and a high land at 0, and that is
 * the right answer: there is no meaningful difference between "very bad" and
 * "slightly worse than very bad".
 */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
};

/** 0–100, weighted by severity. 100 means nothing was found — not that nothing is wrong. */
export function scoreFindings(findings: Finding[]): number {
  const penalty = findings.reduce((total, finding) => total + SEVERITY_WEIGHTS[finding.severity], 0);
  return Math.max(0, 100 - penalty);
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Rule findings and AI findings into one sorted list, with duplicates
 * removed.
 *
 * Identity is (environment, key, ruleId): the same rule firing twice on the
 * same variable is one problem, not two. The cross-layer case — the model
 * re-deriving something a rule already found — is handled upstream in
 * normalizeAiFindings(), where the payload and the rule findings are both in
 * scope; by the time a finding reaches here it has already earned its place.
 *
 * Rule findings are added first, so if an AI finding ever did collide on
 * identity, the deterministic one is the survivor.
 */
export function mergeFindings(ruleFindings: Finding[], aiFindings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const merged: Finding[] = [];

  for (const finding of [...ruleFindings, ...aiFindings]) {
    const identity = `${finding.environmentName} ${finding.key} ${finding.ruleId}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(finding);
  }

  return sortFindings(merged);
}

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type EnvironmentScanResult = {
  environmentId: string;
  environmentName: string;
  variableCount: number;
  /**
   * null when the environment has no variables at all.
   *
   * Subtractive scoring would hand an empty production environment a
   * spotless 100, which is vacuous rather than true — there was nothing to
   * check. Phase 41's "production with no variables shows a neutral
   * placeholder rather than a zero" is this null, and no row is persisted
   * for it either: a scan history where "we looked and found nothing wrong"
   * is indistinguishable from "there was nothing to look at" is a history
   * that misleads.
   */
  score: number | null;
  findings: Finding[];
};

/** Why the AI layer did or didn't contribute — surfaced so the UI can say "rules only" honestly instead of implying a full scan happened. */
export type AiScanStatus = "ok" | "skipped" | "failed";

export type ScanResult = {
  projectId: string;
  projectName: string;
  scannedAt: string;
  environments: EnvironmentScanResult[];
  aiStatus: AiScanStatus;
  /** Human-readable reason when aiStatus isn't "ok". Never contains a value or a prompt. */
  aiDetail?: string;
  aiFindingCount: number;
  persisted: boolean;
};

// ---------------------------------------------------------------------------
// Grouping and persistence
// ---------------------------------------------------------------------------

/**
 * Findings bucketed onto the environment each one is about.
 *
 * This works only because Phase 39's project-level rules emit one finding
 * per *occurrence* — a value reused across staging and production produces a
 * finding in each — so every finding already names exactly one environment.
 * A rule that emitted a single project-level finding would have nowhere to
 * live here, which is worth knowing before adding one.
 */
export function groupFindingsByEnvironment(
  project: ScanProject,
  findings: Finding[],
): EnvironmentScanResult[] {
  return project.environments.map((environment) => {
    const own = findings.filter((finding) => finding.environmentName === environment.name);

    return {
      environmentId: environment.id,
      environmentName: environment.name,
      variableCount: environment.variables.length,
      score: environment.variables.length === 0 ? null : scoreFindings(own),
      findings: own,
    };
  });
}

/**
 * One security_scans row per scored environment.
 *
 * Uses whatever client it's given, so the app's RLS-bound server client is
 * what actually authorises the write — Phase 11's insert policy requires
 * `member`, which is why a readonly user's scan should be run with
 * `persist: false` rather than allowed to fail here.
 *
 * Errors propagate. A scan the user was told was saved but wasn't is worse
 * than an error message, and the audit-log precedent (swallow, log, carry
 * on) doesn't apply: this row *is* the product of the action, not a record
 * of it.
 */
export async function persistScanResults(
  supabase: SupabaseClient<Database>,
  projectId: string,
  results: EnvironmentScanResult[],
): Promise<number> {
  const rows = results
    .filter((result) => result.score !== null)
    .map((result) => ({
      project_id: projectId,
      environment_id: result.environmentId,
      score: result.score as number,
      // Findings are plain JSON — strings, numbers, string arrays, and
      // nothing else (lib/scanner/types.ts). The cast is only because
      // Finding isn't declared with an index signature; there is no
      // structural risk here, and by construction no value to leak into it.
      issues: result.findings as unknown as Json,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("security_scans").insert(rows);
  if (error) throw new Error(`Failed to record the scan: ${error.message}`);

  return rows.length;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type RunSecurityScanOptions = {
  supabase: SupabaseClient<Database>;
  projectId: string;
  /** Off for a rules-only run — used by tests and by anyone without the AI quota to spend. */
  useAi?: boolean;
  persist?: boolean;
  now?: Date;
};

/**
 * Returns null if the project doesn't exist, or the caller can't see it —
 * RLS makes those two indistinguishable from here, which is the point.
 *
 * The AI layer degrades rather than fails: if Groq is down, rate-limiting,
 * or not configured, the scan still returns every rule finding and reports
 * `aiStatus` so the UI can say so. The rules are the product; the model is
 * an addition to it.
 */
export async function runSecurityScan({
  supabase,
  projectId,
  useAi = true,
  persist = true,
  now = new Date(),
}: RunSecurityScanOptions): Promise<ScanResult | null> {
  const project = await loadProjectForScan(supabase, projectId);
  if (!project) return null;

  const ruleFindings = runRuleBasedScan(project, now);
  const hasVariables = project.environments.some(
    (environment) => environment.variables.length > 0,
  );

  let aiFindings: Finding[] = [];
  let aiStatus: AiScanStatus = "ok";
  let aiDetail: string | undefined;

  if (!useAi) {
    aiStatus = "skipped";
    aiDetail = "The AI layer was not requested for this scan.";
  } else if (!hasVariables) {
    aiStatus = "skipped";
    aiDetail = "This project has no variables to analyse.";
  } else if (!process.env.GROQ_API_KEY) {
    // Checked here rather than letting callAI() throw, so an unconfigured
    // deployment reads as "rules only" instead of as a broken scanner.
    aiStatus = "skipped";
    aiDetail = "No AI provider is configured, so this scan used the rules only.";
  } else {
    try {
      aiFindings = await runAiScan({ project, ruleFindings, now });
    } catch (error) {
      aiStatus = "failed";
      aiDetail =
        error instanceof ScanPayloadLeakError || error instanceof PromptContainsSecretError
          ? "The AI layer was stopped by SecureEnv's own safety check and did not run."
          : "The AI provider could not be reached, so this scan used the rules only.";

      // The error's own name and message — never the prompt, never the
      // payload, never AIMalformedResponseError's `raw` field. Same rule as
      // lib/ai/generator/actions.ts.
      console.error(
        `AI scanner layer failed (${error instanceof Error ? error.name : "unknown"}):`,
        error instanceof AIClientError || error instanceof Error ? error.message : error,
      );
    }
  }

  const environments = groupFindingsByEnvironment(
    project,
    mergeFindings(ruleFindings, aiFindings),
  );

  const persistedCount = persist
    ? await persistScanResults(supabase, project.id, environments)
    : 0;

  return {
    projectId: project.id,
    projectName: project.name,
    scannedAt: now.toISOString(),
    environments,
    aiStatus,
    aiDetail,
    aiFindingCount: aiFindings.length,
    persisted: persistedCount > 0,
  };
}
