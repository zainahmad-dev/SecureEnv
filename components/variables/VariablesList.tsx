import { VariableCard } from "@/components/variables/VariableCard";
import { VariableTableRow } from "@/components/variables/VariableTableRow";
import type { VariableSummary } from "@/lib/variables/queries";

const headingCellClass = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide";

export function VariablesList({
  variables,
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
  canManageVariables,
  highlightKey,
}: {
  variables: VariableSummary[];
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  canManageVariables: boolean;
  highlightKey?: string;
}) {
  if (variables.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center">
        <p className="text-sm text-ink/60">No variables in this environment yet.</p>
        {canManageVariables && (
          <p className="mt-1 text-sm text-ink/60">Add one below to get started.</p>
        )}
      </div>
    );
  }

  const rowContext = {
    environmentId,
    projectId,
    teamId,
    teamSlug,
    environmentName,
    canManageVariables,
    highlightKey,
  };

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
              <th scope="col" className={headingCellClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {variables.map((variable, index) => (
              <VariableTableRow key={variable.id} variable={variable} index={index} {...rowContext} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 min-[700px]:hidden">
        {variables.map((variable, index) => (
          <VariableCard key={variable.id} variable={variable} index={index} {...rowContext} />
        ))}
      </ul>
    </>
  );
}
