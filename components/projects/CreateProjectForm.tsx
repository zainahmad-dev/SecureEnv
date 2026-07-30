"use client";

import { useActionState } from "react";
import { createProject, type CreateProjectState } from "@/lib/projects/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

const initialState: CreateProjectState = { error: null, name: "", description: "" };

export function CreateProjectForm({ teamId, teamSlug }: { teamId: string; teamSlug: string }) {
  const [state, formAction, isPending] = useActionState<CreateProjectState, FormData>(
    createProject,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
        <label htmlFor="name" className="text-sm font-medium text-ink">
          Project name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          autoFocus
          defaultValue={state.name}
          placeholder="Marketing site"
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-ink">
          Description <span className="font-normal text-ink/50">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={state.description}
          placeholder="What this project is for"
          className={fieldClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
      >
        {isPending ? "Creating project…" : "Create project"}
      </button>
    </form>
  );
}
