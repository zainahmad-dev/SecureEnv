"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireTeamAccess } from "@/lib/auth/team-access";
import { createClient } from "@/lib/supabase/server";

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

  // Preflight only — RLS's own INSERT policy is what actually enforces this,
  // this exists so a readonly member sees a sentence instead of a raw
  // Postgres error from a policy they can't see the text of.
  const access = await requireTeamAccess(teamId, "member", CREATE_DENIED);
  if (!access.ok) return { error: access.error, name, description };

  const supabase = await createClient();

  // Goes through create_project() rather than a plain insert so the three
  // default environments (Phase 18) are created in the same transaction —
  // never chain .single() after .rpc() for a function that RETURNS a single
  // row directly rather than SETOF, same gotcha as create_team().
  const { data, error } = await supabase.rpc("create_project", {
    p_team_id: teamId,
    p_name: name,
    p_description: description || null,
  });

  if (error || !data) {
    return { error: "Could not create the project. Try again.", name, description };
  }

  // Logged before redirect() — it throws internally, so nothing after it
  // would ever run.
  await logAudit({
    teamId,
    userId: access.userId,
    action: "create",
    targetType: "project",
    targetId: data.id,
    metadata: { name },
  });

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

  // Rename stays admin-only, matching Phase 11's original rule — Phase 17
  // only asked to widen creation to members, not this.
  const access = await requireTeamAccess(teamId, "admin", MANAGE_DENIED);
  if (!access.ok) return { error: access.error, name, description };

  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ name, description: description || null })
    .eq("id", projectId)
    .eq("team_id", teamId);

  if (error) {
    return { error: "Could not save changes. Try again.", name, description };
  }

  await logAudit({
    teamId,
    userId: access.userId,
    action: "update",
    targetType: "project",
    targetId: projectId,
    metadata: { name },
  });

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

  const access = await requireTeamAccess(teamId, "admin", MANAGE_DENIED);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("team_id", teamId);

  if (error) {
    return { error: "Could not delete the project. Try again." };
  }

  await logAudit({
    teamId,
    userId: access.userId,
    action: "delete",
    targetType: "project",
    targetId: projectId,
    metadata: { name: projectName },
  });

  redirect(`/teams/${teamSlug}`);
}
