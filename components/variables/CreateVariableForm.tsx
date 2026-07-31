"use client";

import { useActionState, useEffect, useState } from "react";
import { createVariable, type CreateVariableState } from "@/lib/variables/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

const initialState: CreateVariableState = { error: null, key: "", description: "" };

export function CreateVariableForm({
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
}: {
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
}) {
  const [state, formAction, isPending] = useActionState<CreateVariableState, FormData>(
    createVariable,
    initialState,
  );
  const [value, setValue] = useState("");

  // Cleared only on success. Unlike key/description (echoed back via
  // state.key/state.description so a typo can be fixed without retyping
  // everything), the plaintext value never appears in the returned state at
  // all — this can't rely on re-deriving it from `state` the way those do.
  useEffect(() => {
    if (state.error === null) setValue("");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="environmentId" value={environmentId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />
      <input type="hidden" name="environmentName" value={environmentName} />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-4 min-[700px]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="variable-key" className="text-sm font-medium text-ink">
            Key
          </label>
          <input
            id="variable-key"
            name="key"
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            defaultValue={state.key}
            placeholder="DATABASE_URL"
            className={`${fieldClass} font-mono`}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="variable-value" className="text-sm font-medium text-ink">
            Value
          </label>
          <input
            id="variable-value"
            name="value"
            type="password"
            required
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="••••••••"
            className={`${fieldClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="variable-description" className="text-sm font-medium text-ink">
          Description <span className="font-normal text-ink/50">(optional)</span>
        </label>
        <input
          id="variable-description"
          name="description"
          type="text"
          maxLength={500}
          defaultValue={state.description}
          placeholder="What this is for"
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={`self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
      >
        {isPending ? "Adding…" : "Add variable"}
      </button>
    </form>
  );
}
