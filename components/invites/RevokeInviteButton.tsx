"use client";

import { useActionState } from "react";
import { revokeInvite, type RevokeInviteState } from "@/lib/invites/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: RevokeInviteState = { error: null };

export function RevokeInviteButton({
  inviteId,
  teamId,
  teamSlug,
  email,
}: {
  inviteId: string;
  teamId: string;
  teamSlug: string;
  email: string;
}) {
  const [state, formAction, isPending] = useActionState<RevokeInviteState, FormData>(
    revokeInvite,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="inviteId" value={inviteId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      {/* The visible label is just "Revoke" — which of a dozen identical
          buttons it is only makes sense from the row it sits in, so the
          accessible name spells the address out. It still starts with the
          visible text, so voice control ("click Revoke") keeps working. */}
      <button
        type="submit"
        disabled={isPending}
        aria-label={`Revoke the invitation sent to ${email}`}
        className={`rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60 ${focusRing}`}
      >
        {isPending ? "Revoking…" : "Revoke"}
      </button>

      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
