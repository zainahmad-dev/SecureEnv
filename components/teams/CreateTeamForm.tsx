"use client";

import { useActionState } from "react";
import { createTeam, type CreateTeamState } from "@/lib/teams/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

const initialState: CreateTeamState = { error: null, name: "" };

export function CreateTeamForm() {
  const [state, formAction, isPending] = useActionState<CreateTeamState, FormData>(
    createTeam,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ink">
          Team name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={state.name}
          placeholder="Acme Inc"
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
      >
        {isPending ? "Creating team…" : "Create team"}
      </button>
    </form>
  );
}
