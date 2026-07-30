"use client";

import { useActionState, useState } from "react";
import { deleteEnvironment, type DeleteEnvironmentState } from "@/lib/environments/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: DeleteEnvironmentState = { error: null };

export function DeleteEnvironmentButton({
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
  variableCount,
}: {
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  variableCount: number;
}) {
  const [state, formAction, isPending] = useActionState<DeleteEnvironmentState, FormData>(
    deleteEnvironment,
    initialState,
  );
  const [confirming, setConfirming] = useState(false);

  // Always a two-step confirm — the phase only requires one "when it still
  // contains variables", but this component doesn't know in advance whether
  // a future variable gets added, and a consistent confirm step is cheap.
  // The wording escalates when there's something to lose.
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="environmentId" value={environmentId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      {confirming ? (
        <div className="flex flex-col items-end gap-1">
          {variableCount > 0 && (
            <p className="max-w-56 text-right text-xs text-danger">
              This will permanently destroy {variableCount} variable
              {variableCount === 1 ? "" : "s"} in {environmentName}.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className={`rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
            >
              {isPending ? "Deleting…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`rounded-lg px-2 py-1.5 text-sm text-ink/70 hover:bg-card ${focusRing}`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete the ${environmentName} environment`}
          className={`rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 ${focusRing}`}
        >
          Delete
        </button>
      )}

      {state.error && (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
