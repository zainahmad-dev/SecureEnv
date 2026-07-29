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

  return { team, userId: user.id, role: membership.role };
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
