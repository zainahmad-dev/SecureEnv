"use client";

import { useActionState, useState } from "react";
import { removeMember, type MemberActionState } from "@/lib/teams/member-actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: MemberActionState = { error: null };

export function RemoveMemberButton({
  memberId,
  teamId,
  teamSlug,
  memberLabel,
  isSelf,
}: {
  memberId: string;
  teamId: string;
  teamSlug: string;
  memberLabel: string;
  isSelf: boolean;
}) {
  const [state, formAction, isPending] = useActionState<MemberActionState, FormData>(
    removeMember,
    initialState,
  );
  const [confirming, setConfirming] = useState(false);

  // Two-step rather than a confirm() dialog: a native modal blocks the whole
  // page and can't be styled or read by the rest of the UI. Removal is the one
  // control here with no undo, so it shouldn't be a single stray click.
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
          >
            {isPending ? "Removing…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={`rounded-lg px-2 py-1.5 text-sm text-ink/70 hover:bg-card ${focusRing}`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={isSelf ? "Leave this team" : `Remove ${memberLabel} from this team`}
          className={`rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 ${focusRing}`}
        >
          {isSelf ? "Leave" : "Remove"}
        </button>
      )}

      {state.error && (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
