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
};

/**
 * A team's members, oldest first, with the display fields from their profile.
 *
 * Two queries rather than one embedded select: team_members.user_id and
 * profiles.id both reference auth.users, but there's no foreign key *between*
 * those two tables, so PostgREST has no relationship to embed through.
 *
 * Emails aren't here — they live in auth.users, which no ordinary client can
 * read. Phase 15's members table needs them, and that's the phase that decides
 * how to expose them.
 */
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("team_members")
    .select("id, user_id, role, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (!members || members.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_initials")
    .in(
      "id",
      members.map((member) => member.user_id),
    );

  const profileById = new Map(profiles?.map((profile) => [profile.id, profile]));

  return members.map((member) => {
    const profile = profileById.get(member.user_id);

    return {
      id: member.id,
      userId: member.user_id,
      role: member.role,
      joinedAt: member.created_at,
      displayName: profile?.display_name ?? null,
      initials: profile?.avatar_initials ?? "??",
    };
  });
}
