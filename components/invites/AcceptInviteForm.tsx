"use client";

import { useActionState } from "react";
import { acceptInvite, type AcceptInviteState } from "@/lib/invites/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: AcceptInviteState = { error: null };

export function AcceptInviteForm({ token, teamName }: { token: string; teamName: string }) {
  const [state, formAction, isPending] = useActionState<AcceptInviteState, FormData>(
    acceptInvite,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
      >
        {isPending ? "Joining…" : `Join ${teamName}`}
      </button>
    </form>
  );
}
