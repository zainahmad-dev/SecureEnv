"use client";

import { useActionState, useState } from "react";
import { deleteVariable, type DeleteVariableState } from "@/lib/variables/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: DeleteVariableState = { error: null };

export function DeleteVariableButton({
  variableId,
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
  variableKey,
}: {
  variableId: string;
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  variableKey: string;
}) {
  const [state, formAction, isPending] = useActionState<DeleteVariableState, FormData>(
    deleteVariable,
    initialState,
  );
  const [confirming, setConfirming] = useState(false);

  // Two-step rather than a confirm() dialog — same reasoning as
  // RemoveMemberButton: a native modal blocks the page and can't be styled,
  // and deleting a variable has no undo.
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="variableId" value={variableId} />
      <input type="hidden" name="environmentId" value={environmentId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />
      <input type="hidden" name="environmentName" value={environmentName} />

      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg bg-danger px-2 py-1 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
          >
            {isPending ? "Deleting…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={`rounded-lg px-2 py-1 text-xs text-ink/70 hover:bg-card ${focusRing}`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${variableKey}`}
          className={`rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 ${focusRing}`}
        >
          Delete
        </button>
      )}

      {state.error && (
        <p role="alert" className="max-w-40 text-right text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
