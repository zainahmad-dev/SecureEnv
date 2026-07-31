import { ACTION_LABELS, actionBadgeClass, describeAuditTarget, targetTypeLabel } from "@/lib/audit/presentation";
import type { AuditLogRow } from "@/lib/audit/queries";
import { formatDateTime } from "@/lib/format/date";

const headingCellClass = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide";

const cellClass = "px-3 py-3 align-middle";

function ActionBadge({ action }: { action: AuditLogRow["action"] }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${actionBadgeClass(action)}`}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

function ActorLabel({ row }: { row: AuditLogRow }) {
  if (!row.actorId) return <span className="text-ink/40">—</span>;
  // A resolvable id with nothing to show for it means someone who has since
  // left the team and never set a display name — still worth surfacing as
  // "no longer on the team" rather than a bare truncated UUID.
  return <span className="truncate">{row.actorDisplayName ?? row.actorEmail ?? "Former member"}</span>;
}

function TargetLabel({ row }: { row: AuditLogRow }) {
  const detail = describeAuditTarget(row);
  return (
    <span className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-ink/40">{targetTypeLabel(row.targetType)}</span>
      {detail && <span className="truncate font-mono text-xs text-ink">{detail}</span>}
    </span>
  );
}

export function AuditLogTable({
  rows,
  hasActiveFilters,
}: {
  rows: AuditLogRow[];
  hasActiveFilters: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center">
        <p className="text-sm text-ink/60">
          {hasActiveFilters ? "No activity matches these filters." : "No activity recorded yet."}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: a real table. Mobile: the same rows as stacked cards below
          — same reasoning as the variables list (Phase 25): a 5-column row
          has no readable narrow form via overflow-x-auto alone. */}
      <div className="hidden overflow-x-auto rounded-lg border border-line min-[700px]:block">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead className="bg-card text-ink/50">
            <tr>
              <th scope="col" className={headingCellClass}>
                Timestamp
              </th>
              <th scope="col" className={headingCellClass}>
                Actor
              </th>
              <th scope="col" className={headingCellClass}>
                Action
              </th>
              <th scope="col" className={headingCellClass}>
                Target
              </th>
              <th scope="col" className={headingCellClass}>
                Environment
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className={`${cellClass} whitespace-nowrap text-ink/70`}>
                  {formatDateTime(row.createdAt)}
                </td>
                <td className={`${cellClass} max-w-[12rem] truncate text-ink`}>
                  <ActorLabel row={row} />
                </td>
                <td className={cellClass}>
                  <ActionBadge action={row.action} />
                </td>
                <td className={cellClass}>
                  <TargetLabel row={row} />
                </td>
                <td className={`${cellClass} text-ink/70`}>{row.environmentName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 min-[700px]:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-line bg-card px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <ActionBadge action={row.action} />
              <span className="shrink-0 whitespace-nowrap text-xs text-ink/50">
                {formatDateTime(row.createdAt)}
              </span>
            </div>

            <TargetLabel row={row} />

            <div className="flex items-center justify-between gap-3 text-xs text-ink/60">
              <ActorLabel row={row} />
              {row.environmentName && <span className="shrink-0">{row.environmentName}</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
