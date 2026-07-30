"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isDefaultEnvironmentName } from "@/lib/environments/queries";
import { createClient } from "@/lib/supabase/server";
import type { TeamRole } from "@/lib/teams/roles";

const NAME_MAX_LENGTH = 30;
const NAME_PATTERN = /^[a-z0-9-]+$/;

// Phase 19 gives each environment its own URL segment,
// /teams/[slug]/projects/[projectId]/[environmentName], a sibling of the
// static .../settings route. A static segment always wins routing priority
// over a dynamic one at the same level, so a custom environment literally
// named "settings" would be permanently unreachable — masked by the settings
// page rather than caught by the (project_id, name) unique constraint, which
// wouldn't notice this at all. Same bug class as Phase 16's team-slug "new".
const RESERVED_NAMES = new Set(["settings"]);

const ADD_DENIED = "Only team admins and members can add environments.";
const MANAGE_DENIED = "Only team admins can rename or delete environments.";
const DEFAULT_PROTECTED = "The default environments can't be renamed or deleted.";

// Lowercase-letters/numbers/hyphens only: Phase 19 reflects the selected
// environment in the URL, and retrofitting a stricter format after arbitrary
// names are already saved would be the exact "should have set this up front"
// problem the design-tokens phase warned about.
function validateName(name: string): string | null {
  if (!name) return "Enter an environment name.";
  if (name.length > NAME_MAX_LENGTH) {
    return `Environment name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (!NAME_PATTERN.test(name)) {
    return "Use lowercase letters, numbers, and hyphens only.";
  }
  if (RESERVED_NAMES.has(name)) {
    return `"${name}" is reserved and can't be used as an environment name.`;
  }
  return null;
}

async function getCallerRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  userId: string,
): Promise<TeamRole | null> {
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  return data?.role ?? null;
}

export type AddEnvironmentState = { error: string | null; name: string };

export async function addEnvironment(
  _prevState: AddEnvironmentState,
  formData: FormData,
): Promise<AddEnvironmentState> {
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  // Whichever environment page the form was submitted from — Phase 19 gives
  // every environment its own URL, so revalidating the bare project path
  // wouldn't refresh the tab strip the user is actually looking at.
  const currentEnvironmentName = String(formData.get("currentEnvironmentName") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .toLowerCase();

  const nameError = validateName(name);
  if (nameError) return { error: nameError, name };

  if (!projectId || !teamId || !teamSlug || !currentEnvironmentName) {
    return { error: "Something went wrong. Reload the page and try again.", name };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Preflight only — RLS's own INSERT policy enforces this; matches Phase
  // 17's project-creation gate exactly, since a member creating a project
  // already implies they can insert its environments (see the Phase 18
  // migration comment on why that policy had to widen the same way).
  const role = await getCallerRole(supabase, teamId, user.id);
  if (role === "readonly" || role === null) {
    return { error: ADD_DENIED, name };
  }

  const { data: last } = await supabase
    .from("environments")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("environments").insert({
    project_id: projectId,
    name,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "An environment with that name already exists in this project."
          : "Could not add the environment. Try again.",
      name,
    };
  }

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${currentEnvironmentName}`);

  return { error: null, name: "" };
}

type Target = { id: string; name: string; projectId: string };

/**
 * Shared preflight for rename and delete: session, admin rights on the team,
 * a target row that genuinely belongs to that project, and not one of the
 * three defaults. None of this is the actual enforcement — RLS rejects a
 * non-admin's write, and the Phase 18 triggers reject a default rename or
 * delete regardless of role — this exists so the screen can say why instead
 * of surfacing a raw database error.
 */
async function loadTarget(
  formData: FormData,
): Promise<{ error: string } | { target: Target; teamSlug: string }> {
  const environmentId = String(formData.get("environmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");

  if (!environmentId || !projectId || !teamId || !teamSlug) {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const role = await getCallerRole(supabase, teamId, user.id);
  if (role !== "admin") {
    return { error: MANAGE_DENIED };
  }

  const { data: environment } = await supabase
    .from("environments")
    .select("id, name, project_id")
    .eq("id", environmentId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!environment) {
    return { error: "That environment no longer exists." };
  }

  if (isDefaultEnvironmentName(environment.name)) {
    return { error: DEFAULT_PROTECTED };
  }

  return {
    target: { id: environment.id, name: environment.name, projectId: environment.project_id },
    teamSlug,
  };
}

export type RenameEnvironmentState = { error: string | null; name: string };

export async function renameEnvironment(
  _prevState: RenameEnvironmentState,
  formData: FormData,
): Promise<RenameEnvironmentState> {
  const name = String(formData.get("name") ?? "")
    .trim()
    .toLowerCase();

  const nameError = validateName(name);
  if (nameError) return { error: nameError, name };

  const loaded = await loadTarget(formData);
  if ("error" in loaded) return { error: loaded.error, name };

  const { target, teamSlug } = loaded;

  if (target.name === name) {
    return { error: null, name };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("environments")
    .update({ name })
    .eq("id", target.id)
    .eq("project_id", target.projectId);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "An environment with that name already exists in this project."
          : "Could not rename the environment. Try again.",
      name,
    };
  }

  // The environment's name is its URL segment (Phase 19) — the page the user
  // is standing on (.../<oldName>) no longer resolves to anything once the
  // row's name has changed, so this has to navigate, not just revalidate.
  redirect(`/teams/${teamSlug}/projects/${target.projectId}/${name}`);
}

export type DeleteEnvironmentState = { error: string | null };

export async function deleteEnvironment(
  _prevState: DeleteEnvironmentState,
  formData: FormData,
): Promise<DeleteEnvironmentState> {
  const loaded = await loadTarget(formData);
  if ("error" in loaded) return { error: loaded.error };

  const { target, teamSlug } = loaded;

  const supabase = await createClient();
  const { error } = await supabase
    .from("environments")
    .delete()
    .eq("id", target.id)
    .eq("project_id", target.projectId);

  if (error) {
    return { error: "Could not delete the environment. Try again." };
  }

  // Same reasoning as rename: the page the user is standing on no longer
  // exists once this environment is gone, so navigate rather than
  // revalidate in place. The bare project path redirects to whichever
  // environment is first by sort order — always safe, since the three
  // defaults can never be deleted, so at least one environment always
  // remains.
  redirect(`/teams/${teamSlug}/projects/${target.projectId}`);
}
