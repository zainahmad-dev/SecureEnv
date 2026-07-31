import Link from "next/link";
import { ACTION_LABELS } from "@/lib/audit/presentation";
import { AUDIT_ACTIONS, type AuditLogFilters } from "@/lib/audit/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink ${focusRing}`;

/**
 * A plain GET form — no client JS at all. Submitting it just navigates to
 * this same page with new search params, which the Server Component page
 * re-reads and re-queries with; the browser's own back/forward and
 * bookmarking already work for free because filter state lives in the URL,
 * not in React state.
 */
export function AuditFilterForm({
  teamSlug,
  filters,
  hasActiveFilters,
  actors,
  environments,
}: {
  teamSlug: string;
  filters: AuditLogFilters;
  hasActiveFilters: boolean;
  actors: { id: string; email: string | null; displayName: string | null }[];
  environments: { id: string; label: string }[];
}) {
  return (
    <form
      method="GET"
      action={`/teams/${teamSlug}/audit`}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-user" className="text-sm font-medium text-ink">
          User
        </label>
        <select id="audit-filter-user" name="user" defaultValue={filters.userId ?? ""} className={fieldClass}>
          <option value="">All users</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.displayName ?? actor.email ?? actor.id}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-action" className="text-sm font-medium text-ink">
          Action
        </label>
        <select
          id="audit-filter-action"
          name="action"
          defaultValue={filters.action ?? ""}
          className={fieldClass}
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {ACTION_LABELS[action]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-environment" className="text-sm font-medium text-ink">
          Environment
        </label>
        <select
          id="audit-filter-environment"
          name="environment"
          defaultValue={filters.environmentId ?? ""}
          className={fieldClass}
        >
          <option value="">All environments</option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-from" className="text-sm font-medium text-ink">
          From
        </label>
        <input
          id="audit-filter-from"
          type="date"
          name="from"
          defaultValue={filters.dateFrom ?? ""}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="audit-filter-to" className="text-sm font-medium text-ink">
          To
        </label>
        <input
          id="audit-filter-to"
          type="date"
          name="to"
          defaultValue={filters.dateTo ?? ""}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 ${focusRing}`}
        >
          Filter
        </button>
        {hasActiveFilters && (
          <Link
            href={`/teams/${teamSlug}/audit`}
            className={`rounded-lg px-2 py-2 text-sm text-ink/70 hover:bg-paper ${focusRing}`}
          >
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
