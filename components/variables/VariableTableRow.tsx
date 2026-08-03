"use client";

import { useEffect, useRef, useState } from "react";
import { DeleteVariableButton } from "@/components/variables/DeleteVariableButton";
import { EditVariableForm } from "@/components/variables/EditVariableForm";
import { ValueCell } from "@/components/variables/ValueCell";
import { formatDate } from "@/lib/format/date";
import { ENTRY_ANIMATION_CLASS, entryAnimationStyle } from "@/lib/ui/entry-animation";
import type { VariableSummary } from "@/lib/variables/queries";

const cellClass = "px-3 py-3 align-middle";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

type RowContext = {
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  canManageVariables: boolean;
  /** Set by the scanner's "Fix" action (Phase 41) via ?highlight= — the one row to scroll to and mark. */
  highlightKey?: string;
};

export function VariableTableRow({
  variable,
  index,
  ...context
}: { variable: VariableSummary; index: number } & RowContext) {
  const [editing, setEditing] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const { environmentId, projectId, teamId, teamSlug, environmentName, canManageVariables, highlightKey } =
    context;
  const isHighlighted = highlightKey !== undefined && variable.key === highlightKey;

  // Only the currently-visible variant (desktop table vs. mobile card in
  // VariableCard.tsx) actually has layout, so scrollIntoView on the other
  // one is a harmless no-op — both fire, only one does anything.
  useEffect(() => {
    if (isHighlighted) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isHighlighted]);

  if (editing) {
    return (
      <tr
        className={`border-t border-line bg-card/40 ${ENTRY_ANIMATION_CLASS}`}
        style={entryAnimationStyle(index)}
      >
        <td className={cellClass} colSpan={5}>
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
        </td>
      </tr>
    );
  }

  return (
    <tr
      id={`variable-${variable.key}`}
      ref={rowRef}
      className={`border-t border-line ${isHighlighted ? "bg-accent/10" : ""} ${ENTRY_ANIMATION_CLASS}`}
      style={entryAnimationStyle(index)}
    >
      <td className={cellClass}>
        <code className="font-mono text-sm text-ink">{variable.key}</code>
      </td>
      <td className={`${cellClass} max-w-xs truncate text-ink/60`}>{variable.description ?? "—"}</td>
      <td className={cellClass}>
        <ValueCell variable={variable} />
      </td>
      <td className={`${cellClass} whitespace-nowrap text-ink/70`}>{formatDate(variable.updatedAt)}</td>
      <td className={cellClass}>
        {canManageVariables && (
          <div className="flex items-center justify-end gap-2">
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
      </td>
    </tr>
  );
}
