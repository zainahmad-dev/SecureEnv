"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Set by the scanner's "Fix" action (Phase 41) via ?highlight= — the one card to scroll to and mark. */
  highlightKey?: string;
};

export function VariableCard({
  variable,
  index,
  ...context
}: { variable: VariableSummary; index: number } & CardContext) {
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);
  const { environmentId, projectId, teamId, teamSlug, environmentName, canManageVariables, highlightKey } =
    context;
  const isHighlighted = highlightKey !== undefined && variable.key === highlightKey;

  useEffect(() => {
    if (isHighlighted) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isHighlighted]);

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
      id={`variable-${variable.key}`}
      ref={cardRef}
      className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${isHighlighted ? "border-accent bg-accent/10" : "border-line bg-card"} ${ENTRY_ANIMATION_CLASS}`}
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
        <div className="flex flex-col gap-2 border-t border-line pt-2 min-[700px]:flex-row min-[700px]:items-center">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`w-full rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-ink hover:bg-card min-[700px]:w-auto ${focusRing}`}
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
