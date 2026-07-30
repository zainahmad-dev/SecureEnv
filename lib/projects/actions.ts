"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TeamRole } from "@/lib/teams/roles";

const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 500;

const CREATE_DENIED = "Only team admins and members can create projects.";
const MANAGE_DENIED = "Only team admins can manage this project.";

function validateName(name: string): string | null {
  if (!name) return "Enter a project name.";
  if (name.length > NAME_MAX_LENGTH) {
    return `Project name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

function validateDescription(description: string): string | null {
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
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

export type CreateProjectState = { error: string | null; name: string; description: string };

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  const nameError = validateName(name);
  if (nameError) return { error: nameError, name, description };

  const descriptionError = validateDescription(description);
  if (descriptionError) return { error: descriptionError, name, description };

  if (!teamId || !teamSlug) {
    return { error: "Something went wrong. Reload the page and try again.", name, description };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Preflight only — RLS's own INSERT policy is what actually enforces this,
  // this exists so a readonly member sees a sentence instead of a raw
  // Postgres error from a policy they can't see the text of.
  const role = await getCallerRole(supabase, teamId, user.id);
  if (role === "readonly" || role === null) {
    return { error: CREATE_DENIED, name, description };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      team_id: teamId,
      name,
      description: description || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Could not create the project. Try again.", name, description };
  }

  redirect(`/teams/${teamSlug}/projects/${data.id}`);
}

export type RenameProjectState = { error: string | null; name: string; description: string };

export async function renameProject(
  _prevState: RenameProjectState,
  formData: FormData,
): Promise<RenameProjectState> {
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  const nameError = validateName(name);
  if (nameError) return { error: nameError, name, description };

  const descriptionError = validateDescription(description);
  if (descriptionError) return { error: descriptionError, name, description };

  if (!projectId || !teamId || !teamSlug) {
    return { error: "Something went wrong. Reload the page and try again.", name, description };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Rename stays admin-only, matching Phase 11's original rule — Phase 17
  // only asked to widen creation to members, not this.
  const role = await getCallerRole(supabase, teamId, user.id);
  if (role !== "admin") {
    return { error: MANAGE_DENIED, name, description };
  }

  const { error } = await supabase
    .from("projects")
    .update({ name, description: description || null })
    .eq("id", projectId)
    .eq("team_id", teamId);

  if (error) {
    return { error: "Could not save changes. Try again.", name, description };
  }

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}`);
  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/settings`);

  return { error: null, name, description };
}

export type DeleteProjectState = { error: string | null };

export async function deleteProject(
  _prevState: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const projectName = String(formData.get("projectName") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "");

  if (!projectId || !teamId || !teamSlug) {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  // Re-checked server-side, never trusted from the disabled-submit-button
  // client behaviour alone — a crafted request could skip straight past it.
  if (confirmName !== projectName) {
    return { error: "Type the project name exactly to confirm deletion." };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const role = await getCallerRole(supabase, teamId, user.id);
  if (role !== "admin") {
    return { error: MANAGE_DENIED };
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("team_id", teamId);

  if (error) {
    return { error: "Could not delete the project. Try again." };
  }

  redirect(`/teams/${teamSlug}`);
}
