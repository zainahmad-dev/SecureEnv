import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnvironmentSummary } from "@/lib/environments/queries";
import type { Finding } from "@/lib/scanner/types";
import type { Database } from "@/types/database";

/** How many past scores the sparkline draws, oldest to newest. Enough to show a trend without the SVG getting cramped. */
const HISTORY_LIMIT = 12;

export type ScanRecord = {
  score: number;
  findings: Finding[];
  scannedAt: string;
};

export type EnvironmentScanHistory = {
  /** The most recent recorded scan for this environment, or null if it has never been scanned. */
  latest: ScanRecord | null;
  /** Oldest to newest, capped at HISTORY_LIMIT. Length <= 1 means "nothing to chart yet" — Phase 41's own condition for hiding the sparkline. */
  history: ScanRecord[];
};

const EMPTY_HISTORY: EnvironmentScanHistory = { latest: null, history: [] };

/**
 * Every persisted security_scans row for one project, grouped by
 * environment.
 *
 * Reads through whatever client the caller passes — the app's RLS-bound
 * server client, so a readonly member sees exactly the scores Phase 11's
 * own SELECT policy already grants them, nothing more.
 *
 * `issues` is stored as jsonb; the cast back to Finding[] mirrors
 * lib/scanner/scan.ts's persistScanResults(), which made the same cast in
 * the other direction — there is no structural risk either way, since
 * Finding is exactly the {string, string, string[]?} shape jsonb holds.
 */
export async function getScanHistoryByEnvironment(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<Map<string, EnvironmentScanHistory>> {
  const { data } = await supabase
    .from("security_scans")
    .select("environment_id, score, issues, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const byEnvironment = new Map<string, ScanRecord[]>();
  for (const row of data ?? []) {
    const record: ScanRecord = {
      score: row.score,
      findings: (row.issues ?? []) as unknown as Finding[],
      scannedAt: row.created_at,
    };
    const existing = byEnvironment.get(row.environment_id);
    if (existing) existing.push(record);
    else byEnvironment.set(row.environment_id, [record]);
  }

  const result = new Map<string, EnvironmentScanHistory>();
  for (const [environmentId, records] of byEnvironment) {
    result.set(environmentId, {
      latest: records[records.length - 1],
      history: records.slice(-HISTORY_LIMIT),
    });
  }

  return result;
}

/** One environment's full posture: what the tab strip and the detail panel both need, already merged. */
export type EnvironmentPosture = {
  environmentId: string;
  environmentName: string;
  variableCount: number;
  latest: ScanRecord | null;
  history: ScanRecord[];
};

/**
 * The most recent scan timestamp across every environment, or null if the
 * project has never been scanned. One "Run scan" covers the whole project,
 * so this is the project's own last-scanned time.
 *
 * Lives here, and is called from the Server Component rather than inside
 * ScannerPanel, because the *formatted* result has to be computed exactly
 * once. ScannerPanel is a Client Component: anything it derives from the
 * current clock renders on the server and again on the client, and
 * "Last scanned 4 minutes ago" becomes "5 minutes ago" the moment those two
 * renders straddle a minute boundary — a real hydration mismatch, which is
 * how this was found.
 */
export function latestScanAt(postures: EnvironmentPosture[]): string | null {
  const timestamps = postures
    .map((posture) => posture.latest?.scannedAt)
    .filter((value): value is string => Boolean(value));

  if (timestamps.length === 0) return null;

  return timestamps.reduce((latest, current) => (current > latest ? current : latest));
}

/** Combines Phase 19's environment list with this project's scan history — the shape components/scanner/ScannerPanel.tsx actually renders. */
export function buildEnvironmentPostures(
  environments: EnvironmentSummary[],
  histories: Map<string, EnvironmentScanHistory>,
): EnvironmentPosture[] {
  return environments.map((environment) => {
    const scanHistory = histories.get(environment.id) ?? EMPTY_HISTORY;
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      variableCount: environment.variableCount,
      latest: scanHistory.latest,
      history: scanHistory.history,
    };
  });
}
