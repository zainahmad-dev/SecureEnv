"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/team-access";
import { encryptSecret } from "@/lib/crypto/envelope";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";

const KEY_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
// Starts with a letter (not a digit or underscore), then letters/digits/
// underscores — matches every real env var convention (DATABASE_URL,
// NEXT_PUBLIC_APP_URL) and everything the Phase 12 seed data already uses.
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const CREATE_DENIED = "Only team admins and members can add variables.";
const UPDATE_DENIED = "Only team admins and members can edit variables.";
const DELETE_DENIED = "Only team admins and members can delete variables.";

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

  // Preflight only — RLS's own INSERT policy ("Members can create
  // variables", member-or-admin) is what actually enforces this; a readonly
  // member's own attempt would be rejected there regardless.
  const access = await requireTeamAccess(teamId, "member", CREATE_DENIED);
  if (!access.ok) return { error: access.error, key, description };

  const supabase = await createClient();

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
    created_by: access.userId,
    updated_by: access.userId,
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

// Distinguishes "the client-side initial state, before any real submission"
// from "the action actually ran and succeeded" — both have error: null, so
// without this flag an effect watching for success would also fire on the
// very first mount (when the edit form first appears), immediately closing
// itself before the user typed anything.
export type UpdateVariableState = {
  error: string | null;
  key: string;
  description: string;
  submitted: boolean;
};

export async function updateVariable(
  _prevState: UpdateVariableState,
  formData: FormData,
): Promise<UpdateVariableState> {
  const variableId = String(formData.get("variableId") ?? "");
  const environmentId = String(formData.get("environmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const environmentName = String(formData.get("environmentName") ?? "");

  const key = String(formData.get("key") ?? "")
    .trim()
    .toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  // Blank means "leave the value unchanged" — the literal rule from the
  // phase prompt, not a validation shortcut. Read once, held only in this
  // local, never logged, never echoed back in any returned state.
  const value = String(formData.get("value") ?? "");

  const keyError = validateKey(key);
  if (keyError) return { error: keyError, key, description, submitted: true };

  const descriptionError = validateDescription(description);
  if (descriptionError) return { error: descriptionError, key, description, submitted: true };

  if (!variableId || !environmentId || !projectId || !teamId || !teamSlug || !environmentName) {
    return {
      error: "Something went wrong. Reload the page and try again.",
      key,
      description,
      submitted: true,
    };
  }

  // Preflight only — RLS's own UPDATE policy ("member" minimum, same
  // threshold as create) is what actually enforces this.
  const access = await requireTeamAccess(teamId, "member", UPDATE_DENIED);
  if (!access.ok) return { error: access.error, key, description, submitted: true };

  const supabase = await createClient();

  const update: TablesUpdate<"variables"> = {
    key,
    description: description || null,
    updated_at: new Date().toISOString(),
    updated_by: access.userId,
  };

  // Only re-encrypt when a new value was actually entered. A fresh DEK is
  // generated here exactly like Phase 24's create — never reuse the old
  // one — but when the field was left blank, the encrypted columns aren't
  // touched at all, which is also what keeps the old value's DEK alive for
  // as long as that ciphertext itself is still in use.
  if (value) {
    const encrypted = encryptSecret(value);
    update.encrypted_value = encrypted.encryptedValue;
    update.encrypted_dek = encrypted.encryptedDek;
    update.iv = encrypted.iv;
    update.auth_tag = encrypted.authTag;
  }

  const { error } = await supabase
    .from("variables")
    .update(update)
    .eq("id", variableId)
    .eq("environment_id", environmentId);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `A variable named ${key} already exists in this environment.`
          : "Could not save the variable. Try again.",
      key,
      description,
      submitted: true,
    };
  }

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);

  return { error: null, key, description, submitted: true };
}

export type DeleteVariableState = { error: string | null };

export async function deleteVariable(
  _prevState: DeleteVariableState,
  formData: FormData,
): Promise<DeleteVariableState> {
  const variableId = String(formData.get("variableId") ?? "");
  const environmentId = String(formData.get("environmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const environmentName = String(formData.get("environmentName") ?? "");

  if (!variableId || !environmentId || !projectId || !teamId || !teamSlug || !environmentName) {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  // Preflight only — RLS's own DELETE policy ("member" minimum) enforces
  // this regardless.
  const access = await requireTeamAccess(teamId, "member", DELETE_DENIED);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("variables")
    .delete()
    .eq("id", variableId)
    .eq("environment_id", environmentId);

  if (error) {
    return { error: "Could not delete the variable. Try again." };
  }

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);

  return { error: null };
}
