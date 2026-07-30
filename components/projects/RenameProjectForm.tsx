"use client";

import { useActionState, useState } from "react";
import { renameProject, type RenameProjectState } from "@/lib/projects/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

export function RenameProjectForm({
  projectId,
  teamId,
  teamSlug,
  name,
  description,
}: {
  projectId: string;
  teamId: string;
  teamSlug: string;
  name: string;
  description: string;
}) {
  const initialState: RenameProjectState = { error: null, name, description };
  const [state, formAction, isPending] = useActionState<RenameProjectState, FormData>(
    renameProject,
    initialState,
  );
  const [nameValue, setNameValue] = useState(name);
  const [descriptionValue, setDescriptionValue] = useState(description);

  // Compared against the original committed props, not the action's
  // returned state — after a failed submission the state echoes back exactly
  // what was typed, and comparing against that would hide the retry button
  // right when the error message needs it most.
  const isDirty = nameValue !== name || descriptionValue !== description;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rename-name" className="text-sm font-medium text-ink">
          Project name
        </label>
        <input
          id="rename-name"
          name="name"
          type="text"
          required
          maxLength={60}
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rename-description" className="text-sm font-medium text-ink">
          Description <span className="font-normal text-ink/50">(optional)</span>
        </label>
        <textarea
          id="rename-description"
          name="description"
          rows={3}
          maxLength={500}
          value={descriptionValue}
          onChange={(event) => setDescriptionValue(event.target.value)}
          className={fieldClass}
        />
      </div>

      {isDirty && (
        <button
          type="submit"
          disabled={isPending}
          className={`self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      )}
    </form>
  );
}
