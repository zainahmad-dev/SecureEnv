"use client";

import { useActionState } from "react";
import { CopyableLink } from "@/components/invites/CopyableLink";
import { inviteMember, type InviteState } from "@/lib/invites/actions";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, TEAM_ROLES } from "@/lib/teams/roles";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

const initialState: InviteState = { error: null, inviteUrl: null, email: "", role: "member" };

export function InviteMemberForm({ teamId, teamSlug }: { teamId: string; teamSlug: string }) {
  const [state, formAction, isPending] = useActionState<InviteState, FormData>(
    inviteMember,
    initialState,
  );

  return (
    <div className="flex flex-col gap-4">
      {state.inviteUrl && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-accent-dev/30 bg-accent-dev/10 p-3"
        >
          <p className="text-sm font-medium text-ink">Invite created — send this link.</p>
          <CopyableLink url={state.inviteUrl} label="Invite link" />
          <p className="text-xs text-ink/60">
            Only a hashed copy of this link is stored, so it can&apos;t be shown again. If it
            gets lost, revoke the invite and create a new one. It expires in 7 days.
          </p>
        </div>
      )}

      {/* Remounted after each successful invite so the email field clears; an
          uncontrolled input keeps its DOM value across re-renders otherwise. */}
      <form key={state.inviteUrl ?? "new"} action={formAction} className="flex flex-col gap-4">
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

        <div className="flex flex-col gap-4 min-[700px]:flex-row min-[700px]:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              defaultValue={state.email}
              placeholder="teammate@example.com"
              className={fieldClass}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium text-ink">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue={state.role}
              className={fieldClass}
            >
              {TEAM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]} — {ROLE_DESCRIPTIONS[role]}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={`shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
          >
            {isPending ? "Creating…" : "Create invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
