"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireTeamAccess } from "@/lib/auth/team-access";
import { createInviteToken, hashInviteToken, isWellFormedInviteToken } from "@/lib/invites/token";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

const INVITE_DENIED = "Only team admins can invite people.";
const REVOKE_DENIED = "Only team admins can revoke invites.";

const INVITE_TTL_DAYS = 7;

const ROLES: readonly Enums<"team_role">[] = ["admin", "member", "readonly"];

// Deliberately loose: the authoritative test of an address is whether the
// invite ever reaches a real person. This only rejects input that obviously
// isn't an address at all, rather than pretending to implement RFC 5322.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRole(value: string): value is Enums<"team_role"> {
  return (ROLES as readonly string[]).includes(value);
}

export type InviteState = {
  error: string | null;
  /** Present only on the response that created it — this is the one time it exists. */
  inviteUrl: string | null;
  email: string;
  role: Enums<"team_role">;
};

/**
 * Creates an invite and returns the link for the admin to send.
 *
 * There's no email provider in this stack, so the link is displayed rather than
 * mailed. It's shown exactly once: only the token's HMAC digest is stored, so
 * nothing — not this app, not the database — can reproduce it afterwards. The
 * recovery path is to revoke and re-invite.
 */
export async function inviteMember(
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const roleInput = String(formData.get("role") ?? "member");
  const role = isRole(roleInput) ? roleInput : "member";

  const fail = (error: string): InviteState => ({ error, inviteUrl: null, email, role });

  if (!teamId || !teamSlug) return fail("Something went wrong. Reload the page and try again.");
  if (!email) return fail("Enter an email address.");
  if (!EMAIL_PATTERN.test(email)) return fail("Enter a valid email address.");
  if (!isRole(roleInput)) return fail("Choose a role.");

  // RLS is the enforcement — the INSERT policy below rejects a non-admin
  // outright. This check exists so a non-admin gets an explanation instead of
  // an opaque database error, and so the membership probe that follows isn't
  // even attempted by someone with no business making it.
  const access = await requireTeamAccess(teamId, "admin", INVITE_DENIED);
  if (!access.ok) return fail(access.error);

  const supabase = await createClient();

  const { data: alreadyMember } = await supabase.rpc("team_has_member_with_email", {
    p_team_id: teamId,
    p_email: email,
  });

  if (alreadyMember) {
    return fail("That person is already a member of this team.");
  }

  // Re-inviting the same address supersedes the previous link rather than
  // failing on the pending-invite unique index. The old token stops working
  // the moment this lands, which is the behaviour someone re-sending an invite
  // actually wants.
  const { error: revokeError } = await supabase
    .from("team_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (revokeError) {
    return fail("Could not replace the existing invite. Try again.");
  }

  const { token, tokenHash } = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { data: created, error: insertError } = await supabase
    .from("team_invites")
    .insert({
      team_id: teamId,
      email,
      role,
      token_hash: tokenHash,
      invited_by: access.userId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !created) {
    // 23505 = unique_violation on the pending-invite index: someone else
    // invited this address between the revoke above and this insert.
    if (insertError?.code === "23505") {
      return fail("There's already a pending invite for that email. Reload to see it.");
    }
    return fail("Could not create the invite. Try again.");
  }

  await logAudit({
    teamId,
    userId: access.userId,
    action: "invite",
    targetType: "invite",
    targetId: created.id,
    metadata: { email, role },
  });

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? `https://${requestHeaders.get("host") ?? ""}`;

  revalidatePath(`/teams/${teamSlug}/members`);

  return { error: null, inviteUrl: `${origin}/invite/${token}`, email: "", role };
}

export type RevokeInviteState = { error: string | null };

/**
 * Revokes a pending invite. revoked_at is the only column an admin may update.
 *
 * Phase 28 audit finding: this action previously had no explicit auth check
 * at all — it relied entirely on RLS's UPDATE policy, with no
 * `getCurrentUser()` call and no `requireTeamAccess()`. That's not a
 * security hole (RLS still denies a non-admin's write), but RLS denies an
 * UPDATE by matching zero rows and returning `error: null`, not by raising —
 * so a denied revoke attempt silently reported success to the caller
 * instead of an honest error. Fixed by checking explicitly first.
 */
export async function revokeInvite(
  _prevState: RevokeInviteState,
  formData: FormData,
): Promise<RevokeInviteState> {
  const inviteId = String(formData.get("inviteId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");

  if (!inviteId || !teamId || !teamSlug) {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  const access = await requireTeamAccess(teamId, "admin", REVOKE_DENIED);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();

  // The column grant restricts this to revoked_at, and the row-scoping
  // below (team_id + still-pending) is exactly what an admin's own RLS
  // policy already allows — this is now belt-and-suspenders, not the sole
  // line of defense.
  const { error } = await supabase
    .from("team_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("team_id", teamId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (error) {
    return { error: "Could not revoke that invite." };
  }

  await logAudit({
    teamId,
    userId: access.userId,
    action: "update",
    targetType: "invite",
    targetId: inviteId,
    metadata: { revoked: true },
  });

  revalidatePath(`/teams/${teamSlug}/members`);

  return { error: null };
}

export type AcceptInviteState = { error: string | null };

const ACCEPT_FAILURE_MESSAGES: Record<string, string> = {
  invalid: "This invite link isn't valid. Ask the team admin to send a new one.",
  expired: "This invite has expired. Ask the team admin to send a new one.",
  revoked: "This invite was revoked. Ask the team admin to send a new one.",
  used: "This invite has already been used.",
  email_mismatch:
    "This invite was sent to a different email address. Sign in with that address to accept it.",
  not_authenticated: "Sign in to accept this invitation.",
};

/**
 * Accepts an invitation for the signed-in user.
 *
 * Deliberately a POST-only action rather than something the accept page does on
 * load: a GET that mutates would let a link preview, prefetcher or crawler burn
 * a single-use invite before the invited person ever sees the page.
 *
 * The real work — validating the token, matching the address, claiming the
 * invite and inserting the membership — happens inside accept_team_invite(), in
 * one transaction. Doing it here in several client calls couldn't be atomic and
 * couldn't insert the membership row at all: Phase 11's policies forbid a
 * stranger adding themselves to a team, which is exactly what this is.
 */
export async function acceptInvite(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "");

  if (!isWellFormedInviteToken(token)) {
    return { error: ACCEPT_FAILURE_MESSAGES.invalid };
  }

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_team_invite", {
    p_token_hash: hashInviteToken(token),
  });

  if (error || !data) {
    return { error: "Could not accept the invitation. Try again." };
  }

  if (data.status === "accepted" || data.status === "already_member") {
    // accept_team_invite() returns a team slug/name, not a team_id — the one
    // extra lookup needed to log this. Safe now (unlike before the RPC
    // ran): the caller is confirmed a member of this team either way, so
    // teams' own SELECT policy shows it to them. team_slug is only ever
    // null for the failure statuses handled in the branch below, never for
    // "accepted"/"already_member" — the guard is for the type, not a real
    // runtime case.
    if (data.team_slug) {
      const { data: team } = await supabase
        .from("teams")
        .select("id")
        .eq("slug", data.team_slug)
        .maybeSingle();

      if (team) {
        await logAudit({
          teamId: team.id,
          userId: user.id,
          action: "invite",
          targetType: "team",
          targetId: team.id,
          metadata: { event: data.status === "accepted" ? "invite_accepted" : "already_member" },
        });
      }
    }

    redirect(`/teams/${data.team_slug}`);
  }

  return { error: ACCEPT_FAILURE_MESSAGES[data.status] ?? "Could not accept the invitation." };
}
