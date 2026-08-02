"use client";

import { useActionState, useEffect, useState } from "react";
import { addEnvironment, type AddEnvironmentState } from "@/lib/environments/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: AddEnvironmentState = { error: null, name: "" };

export function AddEnvironmentForm({
  projectId,
  teamId,
  teamSlug,
  currentEnvironmentName,
}: {
  projectId: string;
  teamId: string;
  teamSlug: string;
  currentEnvironmentName: string;
}) {
  const [state, formAction, isPending] = useActionState<AddEnvironmentState, FormData>(
    addEnvironment,
    initialState,
  );
  const [name, setName] = useState("");

  // A controlled field rather than the invite form's remount-on-success
  // trick: that trick keys off a freshly-generated value (the invite URL)
  // that's guaranteed to differ between successes, but a second consecutive
  // add here would return the same {error: null, name: ""} shape as the
  // first, so nothing would change to force a remount.
  useEffect(() => {
    if (state.error === null) setName("");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />
      <input type="hidden" name="currentEnvironmentName" value={currentEnvironmentName} />

      <div className="flex flex-col items-stretch gap-2 min-[700px]:flex-row min-[700px]:flex-wrap min-[700px]:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="new-env-name" className="text-sm font-medium text-ink">
            Add a custom environment
          </label>
          <input
            id="new-env-name"
            name="name"
            type="text"
            required
            maxLength={30}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="preview"
            pattern="[a-z0-9-]+"
            className={`w-full min-[700px]:max-w-xs rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className={`w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-card disabled:opacity-60 min-[700px]:w-auto min-[700px]:shrink-0 ${focusRing}`}
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
