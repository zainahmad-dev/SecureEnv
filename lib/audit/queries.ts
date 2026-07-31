import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type AuditAction = Enums<"audit_action">;

// Mirrors the audit_action enum's own declaration order (Phase 10
// migration) — the one place that order is spelled out again in
// TypeScript, for the filter dropdown.
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "create",
  "read",
  "update",
  "delete",
  "permission_change",
  "invite",
];

export const AUDIT_PAGE_SIZE = 25;

export type AuditLogRow = {
  id: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  environmentId: string | null;
  environmentName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
};

export type AuditLogFilters = {
  userId?: string;
  action?: AuditAction;
  environmentId?: string;
  /** Plain YYYY-MM-DD dates, widened to the full day server-side. */
  dateFrom?: string;
  dateTo?: string;
};

export type AuditLogPage = {
  rows: AuditLogRow[];
  /** The `created_at` of the last row on this page — pass straight back in as the next page's cursor. */
  nextCursor: string | null;
};

async function resolveActors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  userIds: string[],
): Promise<Map<string, { email: string | null; displayName: string | null }>> {
  const map = new Map<string, { email: string | null; displayName: string | null }>();
  if (userIds.length === 0) return map;

  const { data } = await supabase.rpc("get_audit_log_actors", {
    p_team_id: teamId,
    p_user_ids: userIds,
  });

  for (const actor of data ?? []) {
    map.set(actor.user_id, { email: actor.email, displayName: actor.display_name });
  }

  return map;
}

/**
 * One page of a team's audit log, reverse-chronological, with actor and
 * environment name already resolved.
 *
 * Keyset pagination on `created_at` alone, not `(created_at, id)`: every row
 * here is written by `logAudit()` from a real user action, awaited one at a
 * time through this app's own server actions and route handlers — never a
 * bulk insert — so two rows sharing an identical microsecond-precision
 * timestamp isn't a practical concern the way it would be for
 * machine-generated bulk data.
 */
export async function getAuditLogPage(
  teamId: string,
  filters: AuditLogFilters,
  cursor: string | null,
): Promise<AuditLogPage> {
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, target_type, target_id, environment_id, metadata, created_at, user_id, environments(name)",
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    // One extra row, never rendered — its presence is how the page knows
    // there's a next one without a separate count query.
    .limit(AUDIT_PAGE_SIZE + 1);

  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.environmentId) query = query.eq("environment_id", filters.environmentId);
  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
  if (cursor) query = query.lt("created_at", cursor);

  const { data } = await query;
  const rows = data ?? [];
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;

  const actorIds = [
    ...new Set(pageRows.map((row) => row.user_id).filter((id): id is string => id !== null)),
  ];
  const actors = await resolveActors(supabase, teamId, actorIds);

  const mapped: AuditLogRow[] = pageRows.map((row) => {
    const actor = row.user_id ? actors.get(row.user_id) : undefined;
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      environmentId: row.environment_id,
      environmentName: row.environments?.name ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at,
      actorId: row.user_id,
      actorEmail: actor?.email ?? null,
      actorDisplayName: actor?.displayName ?? null,
    };
  });

  const last = pageRows[pageRows.length - 1];

  return { rows: mapped, nextCursor: hasMore && last ? last.created_at : null };
}

const EXPORT_ROW_LIMIT = 10_000;

/**
 * Every row matching the filters, for CSV export — not paginated, unlike
 * getAuditLogPage(), since the whole point of an export is "give me
 * everything that matches," not one page at a time. Capped at
 * EXPORT_ROW_LIMIT as a sanity ceiling; a portfolio-scale team is nowhere
 * near it, but an unbounded query shouldn't be one filter combination away
 * from a runaway response either.
 */
export async function getAuditLogExportRows(
  teamId: string,
  filters: AuditLogFilters,
): Promise<AuditLogRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, target_type, target_id, environment_id, metadata, created_at, user_id, environments(name)",
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(EXPORT_ROW_LIMIT);

  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.environmentId) query = query.eq("environment_id", filters.environmentId);
  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

  const { data } = await query;
  const rows = data ?? [];

  const actorIds = [
    ...new Set(rows.map((row) => row.user_id).filter((id): id is string => id !== null)),
  ];
  const actors = await resolveActors(supabase, teamId, actorIds);

  return rows.map((row) => {
    const actor = row.user_id ? actors.get(row.user_id) : undefined;
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      environmentId: row.environment_id,
      environmentName: row.environments?.name ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.created_at,
      actorId: row.user_id,
      actorEmail: actor?.email ?? null,
      actorDisplayName: actor?.displayName ?? null,
    };
  });
}

export type AuditLogFilterOptions = {
  actors: { id: string; email: string | null; displayName: string | null }[];
  /** label is "<project> / <environment>" — environment names repeat across a team's projects (every project gets its own development/staging/production), so the bare name alone can't tell two apart. */
  environments: { id: string; label: string }[];
};

const ACTOR_SAMPLE_LIMIT = 1000;

/**
 * Distinct actors and environments to populate the filter dropdowns.
 *
 * Actors include anyone who has ever acted on this team, not just current
 * members — Postgrest has no DISTINCT projection, so this samples the most
 * recent ACTOR_SAMPLE_LIMIT rows and de-dupes in JS rather than reaching for
 * a dedicated SQL function just for this; recent-first is also the more
 * useful bias for a filter list than an arbitrary one.
 */
export async function getAuditLogFilterOptions(teamId: string): Promise<AuditLogFilterOptions> {
  const supabase = await createClient();

  const [{ data: logRows }, { data: projects }] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("user_id")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(ACTOR_SAMPLE_LIMIT),
    supabase.from("projects").select("id, name").eq("team_id", teamId).order("name", { ascending: true }),
  ]);

  const actorIds = [
    ...new Set((logRows ?? []).map((row) => row.user_id).filter((id): id is string => id !== null)),
  ];
  const projectNames = new Map((projects ?? []).map((project) => [project.id, project.name]));
  const projectIds = [...projectNames.keys()];

  const [actors, { data: environments }] = await Promise.all([
    resolveActors(supabase, teamId, actorIds),
    projectIds.length > 0
      ? supabase
          .from("environments")
          .select("id, name, project_id")
          .in("project_id", projectIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; name: string; project_id: string }[] }),
  ]);

  return {
    actors: [...actors.entries()]
      .map(([id, actor]) => ({ id, email: actor.email, displayName: actor.displayName }))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")),
    environments: (environments ?? []).map((environment) => ({
      id: environment.id,
      label: `${projectNames.get(environment.project_id) ?? "Unknown project"} / ${environment.name}`,
    })),
  };
}

/**
 * Keyset pagination only ever moves forward through a query — there's no
 * "give me the page before this cursor" without a second, reversed query.
 * Rather than that, the page keeps a small stack of the cursors it's
 * already passed through, encoded into the URL's own `history` param:
 * "Next" pushes the current cursor (or "" for page 1, which has none) onto
 * it, "Previous" pops the last one back off. Comma-joined is safe — cursor
 * values are ISO timestamps, which never contain a comma.
 */
export function parseCursorHistory(raw: string | undefined): (string | null)[] {
  if (!raw) return [];
  return raw.split(",").map((value) => (value === "" ? null : value));
}

export function encodeCursorHistory(history: (string | null)[]): string {
  return history.map((value) => value ?? "").join(",");
}
