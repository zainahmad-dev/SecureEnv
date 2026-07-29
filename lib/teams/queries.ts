import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

/** The slug of the current user's earliest-joined team, or null if they have none. */
export async function getFirstTeamSlug(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("teams(slug)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.teams?.slug ?? null;
}

/**
 * Records which team the user was last on. Best-effort and silent by design —
 * this is a UX preference (Phase 16's switcher/landing-page logic), never an
 * authorization value, so a failed write here must never surface as an error
 * or block whatever the caller was actually doing.
 */
export async function setLastTeam(userId: string, teamId: string): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("profiles").update({ last_team_id: teamId }).eq("id", userId);
  } catch {
    // Preference bookkeeping only — nothing here is worth surfacing.
  }
}

/**
 * Where /dashboard sends a signed-in user: their last-visited team if they're
 * still on it, otherwise Phase 13's original "earliest-joined team" fallback,
 * otherwise null (no team at all — /onboarding's job).
 *
 * The "still on it" check is just teams' own SELECT policy: it already scopes
 * rows to teams the caller is a member of, so a stale last_team_id (left, or
 * removed from, that team) simply returns no row here rather than needing a
 * separate membership check.
 */
export async function getLandingTeamSlug(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("last_team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.last_team_id) {
    const { data: lastTeam } = await supabase
      .from("teams")
      .select("slug")
      .eq("id", profile.last_team_id)
      .maybeSingle();

    if (lastTeam) return lastTeam.slug;
  }

  return getFirstTeamSlug();
}

export type TeamAccess = {
  team: { id: string; name: string; slug: string };
  userId: string;
  role: Enums<"team_role">;
};

/**
 * Resolves a team slug for the signed-in user, along with the role they hold in
 * it. Returns null if there is no session, the slug doesn't exist, or the user
 * isn't a member — deliberately indistinguishable, since RLS already makes the
 * last two identical from the client's side (both are simply zero rows).
 *
 * Callers use this as the page-level gate, but it is not the authorisation:
 * RLS is. Every mutation re-checks server-side.
 */
export async function getTeamAccess(slug: string): Promise<TeamAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!team) return null;

  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return null;

  // Scheduled via after() rather than awaited: this is "last used team"
  // bookkeeping for the switcher, not part of what this page is actually for,
  // so it must never add latency (or a failure mode) to rendering the page.
  after(() => setLastTeam(user.id, team.id));

  return { team, userId: user.id, role: membership.role };
}

export type UserTeamSummary = {
  id: string;
  name: string;
  slug: string;
  role: Enums<"team_role">;
};

/**
 * Every team the signed-in user belongs to, alphabetical by name — the team
 * switcher's list. RLS already scopes team_members to the caller's own rows,
 * so a non-member's teams are simply absent, nothing to filter here.
 */
export async function getUserTeams(): Promise<UserTeamSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("role, teams(id, name, slug)")
    .order("name", { referencedTable: "teams", ascending: true });

  return (data ?? [])
    .filter((row) => row.teams !== null)
    .map((row) => ({
      id: row.teams!.id,
      name: row.teams!.name,
      slug: row.teams!.slug,
      role: row.role,
    }));
}

export type TeamMember = {
  id: string;
  userId: string;
  role: Enums<"team_role">;
  joinedAt: string;
  displayName: string | null;
  initials: string;
  email: string | null;
};

/**
 * A team's members, oldest first, with everything the members table renders.
 *
 * Goes through get_team_members() rather than querying team_members directly
 * because of the email: it lives in auth.users, which no ordinary client can
 * read. That function re-checks membership itself, so a non-member gets the
 * same empty result they'd get from RLS.
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_team_members", { p_team_id: teamId });

  return (data ?? []).map((member) => ({
    id: member.member_id,
    userId: member.user_id,
    role: member.role,
    joinedAt: member.joined_at,
    displayName: member.display_name,
    initials: member.avatar_initials ?? "??",
    email: member.email,
  }));
}
