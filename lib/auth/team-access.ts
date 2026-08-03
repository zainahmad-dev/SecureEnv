import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { DEMO_DENIED_MESSAGE, isDemoSession } from "@/lib/demo/guard";
import { createClient } from "@/lib/supabase/server";
import { roleAtLeast, type TeamRole } from "@/lib/teams/roles";

export type TeamAccessResult =
  | { ok: true; userId: string; role: TeamRole }
  | { ok: false; error: string };

/**
 * The one shared authorization check for every team-scoped mutation, in the
 * order the Phase 28 audit calls for: authenticated, a member of the team
 * that owns the resource, and at least `minRole`. Replaces what had been a
 * `getCallerRole()` helper independently duplicated across five action
 * files, each re-implementing the same query and role comparison by hand —
 * one of them (`revokeInvite`) had drifted to skip the check entirely.
 *
 * Takes the resource's *team* id directly rather than a raw resource id.
 * Every mutation in this codebase already resolves down to a team_id before
 * reaching this point — either a column already on the row (teams,
 * projects, team_members, team_invites) or one already known from the page
 * context that rendered the form (environments, variables, both scoped by
 * a teamId hidden field the same way project/environment ids already are).
 * The one exception is deliberate: `POST /api/variables/[id]/reveal`
 * doesn't call this helper at all, because it has no client-supplied team
 * id to check in the first place — it resolves access by reading the
 * variable row through the RLS-bound client, where Phase 11's own SELECT
 * policy *is* the access check. Retrofitting that route onto this helper
 * would mean trusting a client-supplied id instead of the row's real one,
 * which is a downgrade, not a consistency win.
 *
 * This is a preflight only — RLS enforces the real boundary on whatever
 * write follows. It exists so a denied attempt gets `deniedMessage` back
 * instead of a raw Postgres error, or — the specific bug this closes in
 * `revokeInvite` — an UPDATE/DELETE that RLS silently reduced to zero
 * affected rows while still reporting `error: null`, which reads as
 * success to a caller that never checked authorization itself.
 *
 * Redirects to /login on its own, matching the identical
 * `const user = await getCurrentUser(); if (!user) redirect("/login");`
 * every call site already repeated with zero variation.
 */
export async function requireTeamAccess(
  teamId: string,
  minRole: TeamRole,
  deniedMessage: string,
): Promise<TeamAccessResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Checked before the role lookup, and deliberately from inside this
  // helper rather than added to ~20 action files (Phase 43). Every mutating
  // entry point in this app already funnels through here — that's what
  // docs/permission-audit.md established — so this one branch is what makes
  // "a demo visitor gets an explanation instead of a silent no-op" true
  // everywhere at once, including in actions written after this.
  //
  // It's ordered first because it produces the *more specific* message: the
  // demo account is a readonly member, so leaving it to the role check
  // below would tell a visitor "only admins and members can do that", which
  // is true but explains the wrong thing.
  if (await isDemoSession()) {
    return { ok: false, error: DEMO_DENIED_MESSAGE };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = data?.role ?? null;

  if (role === null || !roleAtLeast(role, minRole)) {
    return { ok: false, error: deniedMessage };
  }

  return { ok: true, userId: user.id, role };
}
