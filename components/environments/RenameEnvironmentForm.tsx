"use client";

import { useActionState, useState } from "react";
import { renameEnvironment, type RenameEnvironmentState } from "@/lib/environments/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function RenameEnvironmentForm({
  environmentId,
  projectId,
  teamId,
  teamSlug,
  name,
}: {
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  name: string;
}) {
  const initialState: RenameEnvironmentState = { error: null, name };
  const [state, formAction, isPending] = useActionState<RenameEnvironmentState, FormData>(
    renameEnvironment,
    initialState,
  );
  const [value, setValue] = useState(name);

  // Compared against the original committed prop, not the action's returned
  // state — same reasoning as RenameProjectForm: the state echoes back
  // exactly what was typed even on failure, which would hide the retry
  // button right when the error message needs it.
  const isDirty = value !== name;

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="environmentId" value={environmentId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      <div className="flex items-center gap-2">
        <label htmlFor={`env-name-${environmentId}`} className="sr-only">
          Environment name
        </label>
        <input
          id={`env-name-${environmentId}`}
          name="name"
          type="text"
          required
          maxLength={30}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          pattern="[a-z0-9-]+"
          className={`w-36 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink ${focusRing}`}
        />

        {isDirty && (
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {state.error && (
        <p role="alert" className="max-w-56 text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
