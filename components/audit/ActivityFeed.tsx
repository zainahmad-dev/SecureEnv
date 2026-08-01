import Link from "next/link";
import { ACTION_LABELS, describeAuditTarget, targetTypeLabel } from "@/lib/audit/presentation";
import type { AuditLogRow } from "@/lib/audit/queries";
import { formatRelativeTime } from "@/lib/format/date";

/**
 * Deliberately its own two-colour scheme, not lib/audit/presentation.ts's
 * five-colour "how consequential is this action" badge palette used on the
 * full audit log page (Phase 30) — the brief here is specifically read vs.
 * write: reads use the environment accent already threaded onto the page
 * via AppShell's `--env-accent` custom property (Phase 19), writes use the
 * neutral brand accent. Falls back to `--accent` if `--env-accent` is ever
 * unset, so this component stays safe to reuse on a page with no current
 * environment.
 */
function activityMarkerClass(action: AuditLogRow["action"]): string {
  return action === "read" ? "bg-[var(--env-accent,var(--accent))]" : "bg-accent";
}

function ActivityRow({ row, isLast }: { row: AuditLogRow; isLast: boolean }) {
  const actor = row.actorId ? (row.actorDisplayName ?? row.actorEmail ?? "Former member") : "System";
  const detail = describeAuditTarget(row);

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!isLast && (
        <span aria-hidden="true" className="absolute bottom-0 left-[4px] top-3 w-px bg-line" />
      )}
      <span
        aria-hidden="true"
        className={`relative z-10 mt-1 h-[9px] w-[9px] shrink-0 rounded-full ${activityMarkerClass(row.action)}`}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* Actor and "action · target" get their own lines, not one shared
            truncated line — a seeded email like
            "jordan@northstaragency.example" alone fills this panel's
            width, which was pushing the action word past the ellipsis. */}
        <p className="truncate text-sm font-medium text-ink">{actor}</p>
        <p className="truncate text-xs text-ink/60">
          {ACTION_LABELS[row.action]} · {detail ?? targetTypeLabel(row.targetType)}
        </p>
        <p className="text-xs text-ink/40">{formatRelativeTime(row.createdAt)}</p>
      </div>
    </li>
  );
}

export function ActivityFeed({ rows, teamSlug }: { rows: AuditLogRow[]; teamSlug: string }) {
  return (
    <aside className="flex h-fit flex-col gap-4 rounded-lg border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        <Link
          href={`/teams/${teamSlug}/audit`}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
        >
          View full log
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink/50">No activity yet.</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, index) => (
            <ActivityRow key={row.id} row={row} isLast={index === rows.length - 1} />
          ))}
        </ol>
      )}
    </aside>
  );
}
