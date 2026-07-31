"use client";

import { useActionState, useEffect } from "react";
import { updateVariable, type UpdateVariableState } from "@/lib/variables/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

export function EditVariableForm({
  variableId,
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
  currentKey,
  currentDescription,
  onCancel,
  onSaved,
}: {
  variableId: string;
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  currentKey: string;
  currentDescription: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialState: UpdateVariableState = {
    error: null,
    key: currentKey,
    description: currentDescription ?? "",
    submitted: false,
  };
  const [state, formAction, isPending] = useActionState<UpdateVariableState, FormData>(
    updateVariable,
    initialState,
  );

  // Only a real successful submission closes the form back to view mode —
  // `submitted` is what tells this apart from the initial mount, which also
  // has error: null and would otherwise close the form before the user
  // typed anything.
  useEffect(() => {
    if (state.submitted && state.error === null) onSaved();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="variableId" value={variableId} />
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

      <div className="flex flex-col gap-3 min-[700px]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`edit-key-${variableId}`} className="text-sm font-medium text-ink">
            Key
          </label>
          <input
            id={`edit-key-${variableId}`}
            name="key"
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            defaultValue={state.key}
            className={`${fieldClass} font-mono`}
          />
        </div>

        {/* Never pre-filled, on purpose — pre-filling would mean decrypting
            on page load, exactly the rule Phase 25 set. Left blank, the
            action leaves the stored value untouched. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`edit-value-${variableId}`} className="text-sm font-medium text-ink">
            Value <span className="font-normal text-ink/50">(leave blank to keep it)</span>
          </label>
          <input
            id={`edit-value-${variableId}`}
            name="value"
            type="password"
            autoComplete="off"
            placeholder="••••••••"
            className={`${fieldClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`edit-description-${variableId}`} className="text-sm font-medium text-ink">
          Description <span className="font-normal text-ink/50">(optional)</span>
        </label>
        <input
          id={`edit-description-${variableId}`}
          name="description"
          type="text"
          maxLength={500}
          defaultValue={state.description}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-lg px-3 py-2 text-sm text-ink/70 hover:bg-card ${focusRing}`}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
