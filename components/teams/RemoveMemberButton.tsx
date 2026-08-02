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
    <form action={formAction} className="flex w-full flex-col items-stretch gap-1 min-[700px]:w-auto min-[700px]:items-end">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      {confirming ? (
        // Stacked and full-width below 700px, not a side-by-side pair —
        // Confirm/Cancel sitting right next to each other at touch size is
        // exactly the mis-tap risk a two-step destructive confirm exists to
        // avoid in the first place.
        <div className="flex flex-col gap-2 min-[700px]:flex-row min-[700px]:items-center">
          <button
            type="submit"
            disabled={isPending}
            className={`w-full rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 min-[700px]:w-auto ${focusRing}`}
          >
            {isPending ? "Removing…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={`w-full rounded-lg px-2 py-1.5 text-sm text-ink/70 hover:bg-card min-[700px]:w-auto ${focusRing}`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={isSelf ? "Leave this team" : `Remove ${memberLabel} from this team`}
          className={`w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 min-[700px]:w-auto ${focusRing}`}
        >
          {isSelf ? "Leave" : "Remove"}
        </button>
      )}

      {state.error && (
        <p role="alert" className="text-left text-xs text-danger min-[700px]:max-w-56 min-[700px]:text-right">
          {state.error}
        </p>
      )}
    </form>
  );
}
