"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TEAM_ROLES, type TeamRole } from "@/lib/teams/roles";

export type MemberActionState = { error: string | null };

const LAST_ADMIN_MESSAGE =
  "A team must always have at least one admin. Make someone else an admin first.";

const GENERIC_DENIED = "Only team admins can change members.";

function isRole(value: string): value is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(value);
}

type Target = {
  id: string;
  userId: string;
  role: TeamRole;
  teamId: string;
};

/**
 * Everything both actions need before they're allowed to touch anything:
 * a session, admin rights on the team in question, and a target membership row
 * that genuinely belongs to that team.
 *
 * None of this is the enforcement — RLS rejects a non-admin's write outright,
 * and the last-admin trigger rejects the rest. It exists so the screen can say
 * what went wrong, and so a mismatched teamId/memberId pair is caught before a
 * mutation is attempted rather than silently updating zero rows.
 */
async function loadTarget(
  formData: FormData,
): Promise<{ error: string } | { target: Target; teamSlug: string; callerId: string }> {
  const memberId = String(formData.get("memberId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");

  if (!memberId || !teamId || !teamSlug) {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: caller } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (caller?.role !== "admin") {
    return { error: GENERIC_DENIED };
  }

  const { data: target } = await supabase
    .from("team_members")
    .select("id, user_id, role, team_id")
    .eq("id", memberId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!target) {
    return { error: "That member is no longer on this team." };
  }

  return {
    target: { id: target.id, userId: target.user_id, role: target.role, teamId: target.team_id },
    teamSlug,
    callerId: user.id,
  };
}

/** True when this team would be left with no admin at all. */
async function wouldStrandTeam(target: Target): Promise<boolean> {
  if (target.role !== "admin") return false;

  const supabase = await createClient();
  const { count } = await supabase
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", target.teamId)
    .eq("role", "admin");

  return (count ?? 0) <= 1;
}

export async function updateMemberRole(
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const roleInput = String(formData.get("role") ?? "");
  if (!isRole(roleInput)) {
    return { error: "Choose a role." };
  }

  const loaded = await loadTarget(formData);
  if ("error" in loaded) return { error: loaded.error };

  const { target, teamSlug } = loaded;

  if (target.role === roleInput) {
    return { error: null };
  }

  if (roleInput !== "admin" && (await wouldStrandTeam(target))) {
    return { error: LAST_ADMIN_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .update({ role: roleInput })
    .eq("id", target.id)
    .eq("team_id", target.teamId);

  if (error) {
    // P0001 is the last-admin trigger firing — reachable if someone demoted the
    // other admin between the check above and this write.
    return { error: error.code === "P0001" ? LAST_ADMIN_MESSAGE : "Could not change that role." };
  }

  revalidatePath(`/teams/${teamSlug}/members`);

  return { error: null };
}

export async function removeMember(
  _prevState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const loaded = await loadTarget(formData);
  if ("error" in loaded) return { error: loaded.error };

  const { target, teamSlug, callerId } = loaded;

  if (await wouldStrandTeam(target)) {
    return { error: LAST_ADMIN_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", target.id)
    .eq("team_id", target.teamId);

  if (error) {
    return {
      error: error.code === "P0001" ? LAST_ADMIN_MESSAGE : "Could not remove that member.",
    };
  }

  // An admin who removed themselves can no longer read this team at all, so
  // re-rendering the page they're standing on would just 404 them.
  if (target.userId === callerId) {
    redirect("/dashboard");
  }

  revalidatePath(`/teams/${teamSlug}/members`);

  return { error: null };
}
