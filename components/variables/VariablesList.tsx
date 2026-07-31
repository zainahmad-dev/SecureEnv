import { formatDate } from "@/lib/format/date";
import type { VariableSummary } from "@/lib/variables/queries";

const headingCellClass = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide";

const cellClass = "px-3 py-3 align-middle";

const publicBadgeClass =
  "rounded-full border border-accent-dev/30 bg-accent-dev/10 px-2 py-0.5 text-xs font-medium text-accent-dev";

/**
 * A fixed-width solid bar, never the value's own length — a masked value's
 * width must not leak how long the secret is.
 */
function RedactionBar() {
  return <span aria-label="Value hidden" className="inline-block h-4 w-28 rounded bg-ink/15" />;
}

function ValueCell({ variable }: { variable: VariableSummary }) {
  if (!variable.isPublic) return <RedactionBar />;

  if (variable.decryptionFailed) {
    return <span className="text-xs text-danger">Could not decrypt this value.</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="truncate rounded bg-card px-2 py-1 font-mono text-xs text-ink">
        {variable.publicValue}
      </code>
      <span className={publicBadgeClass}>Public</span>
    </div>
  );
}

export function VariablesList({
  variables,
  canCreateVariable,
}: {
  variables: VariableSummary[];
  canCreateVariable: boolean;
}) {
  if (variables.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center">
        <p className="text-sm text-ink/60">No variables in this environment yet.</p>
        {canCreateVariable && (
          <p className="mt-1 text-sm text-ink/60">Add one below to get started.</p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Desktop: a real table. Mobile: the same rows as stacked cards below
          — not the same markup squeezed by overflow-x-auto, since a row with
          five columns has no readable narrow form. */}
      <div className="hidden overflow-x-auto rounded-lg border border-line min-[700px]:block">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead className="bg-card text-ink/50">
            <tr>
              <th scope="col" className={headingCellClass}>
                Key
              </th>
              <th scope="col" className={headingCellClass}>
                Description
              </th>
              <th scope="col" className={headingCellClass}>
                Value
              </th>
              <th scope="col" className={headingCellClass}>
                Updated
              </th>
              {/* Reserved, not yet filled — reveal (Phase 26) and edit/delete
                  (Phase 27) land in this same cell rather than a restructured
                  table. */}
              <th scope="col" className={headingCellClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {variables.map((variable) => (
              <tr key={variable.id} className="border-t border-line">
                <td className={cellClass}>
                  <code className="font-mono text-sm text-ink">{variable.key}</code>
                </td>
                <td className={`${cellClass} max-w-xs truncate text-ink/60`}>
                  {variable.description ?? "—"}
                </td>
                <td className={cellClass}>
                  <ValueCell variable={variable} />
                </td>
                <td className={`${cellClass} whitespace-nowrap text-ink/70`}>
                  {formatDate(variable.updatedAt)}
                </td>
                <td className={cellClass} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 min-[700px]:hidden">
        {variables.map((variable) => (
          <li
            key={variable.id}
            className="flex flex-col gap-2 rounded-lg border border-line bg-card px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <code className="min-w-0 truncate font-mono text-sm text-ink">{variable.key}</code>
              <span className="shrink-0 whitespace-nowrap text-xs text-ink/50">
                {formatDate(variable.updatedAt)}
              </span>
            </div>

            {variable.description && <p className="text-sm text-ink/60">{variable.description}</p>}

            <ValueCell variable={variable} />
          </li>
        ))}
      </ul>
    </>
  );
}
