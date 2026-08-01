"use client";

import { useState } from "react";
import { DeleteVariableButton } from "@/components/variables/DeleteVariableButton";
import { EditVariableForm } from "@/components/variables/EditVariableForm";
import { ValueCell } from "@/components/variables/ValueCell";
import { formatDate } from "@/lib/format/date";
import { ENTRY_ANIMATION_CLASS, entryAnimationStyle } from "@/lib/ui/entry-animation";
import type { VariableSummary } from "@/lib/variables/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

type CardContext = {
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  canManageVariables: boolean;
};

export function VariableCard({
  variable,
  index,
  ...context
}: { variable: VariableSummary; index: number } & CardContext) {
  const [editing, setEditing] = useState(false);
  const { environmentId, projectId, teamId, teamSlug, environmentName, canManageVariables } = context;

  if (editing) {
    return (
      <li
        className={`rounded-lg border border-line bg-card px-4 py-3 ${ENTRY_ANIMATION_CLASS}`}
        style={entryAnimationStyle(index)}
      >
        <EditVariableForm
          variableId={variable.id}
          environmentId={environmentId}
          projectId={projectId}
          teamId={teamId}
          teamSlug={teamSlug}
          environmentName={environmentName}
          currentKey={variable.key}
          currentDescription={variable.description}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-line bg-card px-4 py-3 ${ENTRY_ANIMATION_CLASS}`}
      style={entryAnimationStyle(index)}
    >
      <div className="flex items-start justify-between gap-3">
        <code className="min-w-0 truncate font-mono text-sm text-ink">{variable.key}</code>
        <span className="shrink-0 whitespace-nowrap text-xs text-ink/50">
          {formatDate(variable.updatedAt)}
        </span>
      </div>

      {variable.description && <p className="text-sm text-ink/60">{variable.description}</p>}

      <ValueCell variable={variable} />

      {canManageVariables && (
        <div className="flex items-center gap-2 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-ink hover:bg-card ${focusRing}`}
          >
            Edit
          </button>
          <DeleteVariableButton
            variableId={variable.id}
            environmentId={environmentId}
            projectId={projectId}
            teamId={teamId}
            teamSlug={teamSlug}
            environmentName={environmentName}
            variableKey={variable.key}
          />
        </div>
      )}
    </li>
  );
}
