import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditFilterForm } from "@/components/audit/AuditFilterForm";
import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { AppShell } from "@/components/shell/AppShell";
import {
  AUDIT_ACTIONS,
  encodeCursorHistory,
  getAuditLogFilterOptions,
  getAuditLogPage,
  parseCursorHistory,
  type AuditAction,
  type AuditLogFilters,
} from "@/lib/audit/queries";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getTeamAccess } from "@/lib/teams/queries";

type SearchParams = Record<string, string | string[] | undefined>;

function asString(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

function isAuditAction(value: string | undefined): value is AuditAction {
  return value !== undefined && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

/** Builds the audit page URL for a given cursor/history, preserving every active filter. */
function buildPageUrl(
  teamSlug: string,
  filters: AuditLogFilters,
  cursor: string | null,
  history: (string | null)[],
): string {
  const params = new URLSearchParams();
  if (filters.userId) params.set("user", filters.userId);
  if (filters.action) params.set("action", filters.action);
  if (filters.environmentId) params.set("environment", filters.environmentId);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (cursor) params.set("cursor", cursor);
  if (history.length > 0) params.set("history", encodeCursorHistory(history));

  const query = params.toString();
  return `/teams/${teamSlug}/audit${query ? `?${query}` : ""}`;
}

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team } = access;

  const actionParam = asString(sp.action);
  const filters: AuditLogFilters = {
    userId: asString(sp.user),
    action: isAuditAction(actionParam) ? actionParam : undefined,
    environmentId: asString(sp.environment),
    dateFrom: asString(sp.from),
    dateTo: asString(sp.to),
  };
  const hasActiveFilters = Object.values(filters).some((value) => value !== undefined);

  const cursor = asString(sp.cursor) ?? null;
  const history = parseCursorHistory(asString(sp.history));

  const [sidebar, page, filterOptions] = await Promise.all([
    getSidebarData(team.id),
    getAuditLogPage(team.id, filters, cursor),
    getAuditLogFilterOptions(team.id),
  ]);

  const nextUrl = page.nextCursor
    ? buildPageUrl(team.slug, filters, page.nextCursor, [...history, cursor])
    : null;

  const previousHistory = history.slice(0, -1);
  const previousCursor = history.length > 0 ? history[history.length - 1] : null;
  // "Previous" is only reachable once we've actually moved off page 1 —
  // history is empty on page 1 by construction, never appended to until
  // the first "Next" click.
  const previousUrl = history.length > 0 ? buildPageUrl(team.slug, filters, previousCursor, previousHistory) : null;

  const exportParams = new URLSearchParams({ teamId: team.id });
  if (filters.userId) exportParams.set("user", filters.userId);
  if (filters.action) exportParams.set("action", filters.action);
  if (filters.environmentId) exportParams.set("environment", filters.environmentId);
  if (filters.dateFrom) exportParams.set("from", filters.dateFrom);
  if (filters.dateTo) exportParams.set("to", filters.dateTo);

  return (
    <AppShell breadcrumb={[team.name, "Audit log"]} sidebar={sidebar}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Audit log</h1>
            <p className="text-ink/60">Every mutation on {team.name}, most recent first.</p>
          </div>

          <a
            href={`/api/audit/export?${exportParams.toString()}`}
            className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
          >
            Export CSV
          </a>
        </div>

        {/* Keyed on the filter values themselves so a client-side Link
            navigation (Clear, or any filter change) forces a real remount
            instead of reusing the existing <select>/<input> DOM nodes —
            defaultValue/defaultChecked only ever apply on first mount in
            React, so without this the fields would keep showing whatever
            was selected before even once the server has already re-rendered
            with different filters. Same class of fix as AddEnvironmentForm's
            key-based remount trick. */}
        <AuditFilterForm
          key={[filters.userId, filters.action, filters.environmentId, filters.dateFrom, filters.dateTo].join("|")}
          teamSlug={team.slug}
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          actors={filterOptions.actors}
          environments={filterOptions.environments}
        />

        <AuditLogTable rows={page.rows} hasActiveFilters={hasActiveFilters} />

        {(previousUrl || nextUrl) && (
          <div className="flex items-center justify-between">
            {previousUrl ? (
              <Link
                href={previousUrl}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
              >
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {nextUrl && (
              <Link
                href={nextUrl}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
              >
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
