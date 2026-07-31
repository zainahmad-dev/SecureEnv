"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto/envelope";
import { createClient } from "@/lib/supabase/server";
import type { TeamRole } from "@/lib/teams/roles";

const KEY_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
// Starts with a letter (not a digit or underscore), then letters/digits/
// underscores — matches every real env var convention (DATABASE_URL,
// NEXT_PUBLIC_APP_URL) and everything the Phase 12 seed data already uses.
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const CREATE_DENIED = "Only team admins and members can add variables.";

function validateKey(key: string): string | null {
  if (!key) return "Enter a variable key.";
  if (key.length > KEY_MAX_LENGTH) {
    return `Key must be ${KEY_MAX_LENGTH} characters or fewer.`;
  }
  if (!KEY_PATTERN.test(key)) {
    return "Use uppercase letters, numbers, and underscores only, starting with a letter.";
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

// Deliberately has no `value` field, even to echo back on failure — unlike
// key/description, the plaintext value must never appear in a server
// response, so there is nothing for the client to re-render it from. The
// form clears its own value field itself.
export type CreateVariableState = { error: string | null; key: string; description: string };

export async function createVariable(
  _prevState: CreateVariableState,
  formData: FormData,
): Promise<CreateVariableState> {
  const environmentId = String(formData.get("environmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const environmentName = String(formData.get("environmentName") ?? "");

  const key = String(formData.get("key") ?? "")
    .trim()
    .toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  // Read once, held only in this local for the duration of the call, never
  // logged and never included in any returned state or error message.
  const value = String(formData.get("value") ?? "");

  const keyError = validateKey(key);
  if (keyError) return { error: keyError, key, description };

  const descriptionError = validateDescription(description);
  if (descriptionError) return { error: descriptionError, key, description };

  if (!value) {
    return { error: "Enter a value.", key, description };
  }

  if (!environmentId || !projectId || !teamId || !teamSlug || !environmentName) {
    return { error: "Something went wrong. Reload the page and try again.", key, description };
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Preflight only — RLS's own INSERT policy ("Members can create
  // variables", member-or-admin) is what actually enforces this; a readonly
  // member's own attempt would be rejected there regardless.
  const role = await getCallerRole(supabase, teamId, user.id);
  if (role === "readonly" || role === null) {
    return { error: CREATE_DENIED, key, description };
  }

  const { data: environment } = await supabase
    .from("environments")
    .select("id")
    .eq("id", environmentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!environment) {
    return { error: "That environment no longer exists.", key, description };
  }

  // The one non-negotiable line in this whole action: encrypted before it
  // ever reaches a database call, an error message, or a log line.
  const encrypted = encryptSecret(value);

  const { error } = await supabase.from("variables").insert({
    environment_id: environmentId,
    key,
    encrypted_value: encrypted.encryptedValue,
    encrypted_dek: encrypted.encryptedDek,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    description: description || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    return {
      // 23505 = unique_violation on (environment_id, key). The key itself
      // isn't secret (rule #2/#3 are about values), so naming it here is
      // fine and helpful.
      error:
        error.code === "23505"
          ? `A variable named ${key} already exists in this environment.`
          : "Could not save the variable. Try again.",
      key,
      description,
    };
  }

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);

  return { error: null, key: "", description: "" };
}
