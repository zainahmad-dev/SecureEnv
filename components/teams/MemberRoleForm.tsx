"use client";

import { useActionState, useState } from "react";
import { updateMemberRole, type MemberActionState } from "@/lib/teams/member-actions";
import { ROLE_LABELS, TEAM_ROLES, type TeamRole } from "@/lib/teams/roles";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: MemberActionState = { error: null };

export function MemberRoleForm({
  memberId,
  teamId,
  teamSlug,
  role,
  memberLabel,
}: {
  memberId: string;
  teamId: string;
  teamSlug: string;
  role: TeamRole;
  memberLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<MemberActionState, FormData>(
    updateMemberRole,
    initialState,
  );
  const [selected, setSelected] = useState<TeamRole>(role);

  // Save appears only once the value actually differs. This is a form-state
  // affordance, not a permission one — a readonly member never reaches this
  // component at all, so nothing here advertises a capability to someone who
  // doesn't have it.
  const isDirty = selected !== role;

  return (
    <form action={formAction} className="flex w-full flex-col items-start gap-1 min-[700px]:w-auto">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />

      {/* Stacked and full-width below 700px (the same breakpoint
          MembersTable switches from cards to a table at) — a touch target
          this narrow shouldn't also be squeezed into half a row. */}
      <div className="flex w-full flex-col gap-2 min-[700px]:w-auto min-[700px]:flex-row min-[700px]:items-center">
        <label htmlFor={`role-${memberId}`} className="sr-only">
          Role for {memberLabel}
        </label>
        <select
          id={`role-${memberId}`}
          name="role"
          value={selected}
          onChange={(event) => setSelected(event.target.value as TeamRole)}
          className={`w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink min-[700px]:w-auto ${focusRing}`}
        >
          {TEAM_ROLES.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABELS[option]}
            </option>
          ))}
        </select>

        {isDirty && (
          <button
            type="submit"
            disabled={isPending}
            className={`w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 min-[700px]:w-auto ${focusRing}`}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {state.error && (
        <p role="alert" className="max-w-56 text-xs text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
