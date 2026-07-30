"use client";

import { useActionState, useState } from "react";
import { deleteProject, type DeleteProjectState } from "@/lib/projects/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: DeleteProjectState = { error: null };

export function DeleteProjectSection({
  projectId,
  teamId,
  teamSlug,
  projectName,
  variableCount,
}: {
  projectId: string;
  teamId: string;
  teamSlug: string;
  projectName: string;
  variableCount: number;
}) {
  const [state, formAction, isPending] = useActionState<DeleteProjectState, FormData>(
    deleteProject,
    initialState,
  );
  const [confirming, setConfirming] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const matches = confirmName === projectName;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
      <div>
        <h2 className="text-sm font-semibold text-danger">Danger zone</h2>
        <p className="mt-1 text-sm text-ink/70">
          Deleting this project permanently destroys{" "}
          <strong className="font-medium text-ink">
            {variableCount} variable{variableCount === 1 ? "" : "s"}
          </strong>{" "}
          across all of its environments. This cannot be undone.
        </p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`self-start rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 ${focusRing}`}
        >
          Delete project
        </button>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="teamSlug" value={teamSlug} />
          <input type="hidden" name="projectName" value={projectName} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-name" className="text-sm text-ink/70">
              Type <strong className="font-medium text-ink">{projectName}</strong> to confirm.
            </label>
            <input
              id="confirm-name"
              name="confirmName"
              type="text"
              autoComplete="off"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              className={`w-full max-w-sm rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink ${focusRing}`}
            />
          </div>

          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!matches || isPending}
              className={`rounded-lg bg-danger px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
            >
              {isPending ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setConfirmName("");
              }}
              className={`rounded-lg px-3 py-2 text-sm text-ink/70 hover:bg-card ${focusRing}`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
