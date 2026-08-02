"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_SUGGESTIONS } from "@/lib/ai/generator/schema";
import { logAudit } from "@/lib/audit";
import { requireTeamAccess } from "@/lib/auth/team-access";
import { encryptSecret } from "@/lib/crypto/envelope";
import { createClient } from "@/lib/supabase/server";
import { validateKey } from "@/lib/variables/key";
import type { TablesUpdate } from "@/types/database";

const DESCRIPTION_MAX_LENGTH = 500;

const CREATE_DENIED = "Only team admins and members can add variables.";
const UPDATE_DENIED = "Only team admins and members can edit variables.";
const DELETE_DENIED = "Only team admins and members can delete variables.";

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

  const { data: created, error } = await supabase
    .from("variables")
    .insert({
      environment_id: environmentId,
      key,
      encrypted_value: encrypted.encryptedValue,
      encrypted_dek: encrypted.encryptedDek,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      description: description || null,
      created_by: access.userId,
      updated_by: access.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    return {
      // 23505 = unique_violation on (environment_id, key). The key itself
      // isn't secret (rule #2/#3 are about values), so naming it here is
      // fine and helpful.
      error:
        error?.code === "23505"
          ? `A variable named ${key} already exists in this environment.`
          : "Could not save the variable. Try again.",
      key,
      description,
    };
  }

  await logAudit({
    teamId,
    userId: access.userId,
    action: "create",
    targetType: "variable",
    targetId: created.id,
    environmentId,
    metadata: { key },
  });

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

  await logAudit({
    teamId,
    userId: access.userId,
    action: "update",
    targetType: "variable",
    targetId: variableId,
    environmentId,
    // Not "valueChanged" — the audit metadata guard strips any key
    // containing the word "value" as a whole word, on purpose (it can't
    // tell a flag name from a field that holds one), so a field named that
    // would silently vanish instead of recording anything.
    metadata: { key, rotated: Boolean(value) },
  });

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);

  return { error: null, key, description, submitted: true };
}

// Same deliberate omission as CreateVariableState: no values, not even to
// echo back on failure. The generator's checklist holds its own value inputs
// in client state, so a rejected save re-renders from what's still on screen
// rather than from anything the server sent back.
export type AddGeneratedVariablesState = { error: string | null };

/**
 * The Phase 38 generator's save step: several user-entered values at once,
 * through exactly the same encryption path as createVariable() above —
 * encryptSecret() per row, a fresh DEK each, no plaintext column anywhere.
 * It lives in this file rather than next to the generator specifically so
 * there is still only one module in this codebase that writes a variable.
 *
 * The AI's contribution ends at the key names. Every value here was typed by
 * the user into the checklist; nothing generated is ever stored as a value.
 */
export async function addGeneratedVariables(
  _prevState: AddGeneratedVariablesState,
  formData: FormData,
): Promise<AddGeneratedVariablesState> {
  const environmentId = String(formData.get("environmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const environmentName = String(formData.get("environmentName") ?? "");

  if (!environmentId || !projectId || !teamId || !teamSlug || !environmentName) {
    return { error: "Something went wrong. Reload the page and try again." };
  }

  const keys = formData
    .getAll("selected")
    .map((entry) => String(entry).trim().toUpperCase())
    .filter(Boolean);

  if (keys.length === 0) {
    return { error: "Tick at least one variable to add." };
  }
  if (keys.length > MAX_SUGGESTIONS) {
    return { error: `Add at most ${MAX_SUGGESTIONS} variables at a time.` };
  }
  if (new Set(keys).size !== keys.length) {
    return { error: "The same key was submitted twice. Reload the page and try again." };
  }

  // Values and descriptions are addressed by key rather than read as three
  // parallel getAll() arrays. Positional pairing would work right up until
  // someone reorders the JSX or an unticked row stops rendering its inputs,
  // at which point a value would silently land under the wrong key — the one
  // failure mode in this action that encryption wouldn't save anyone from.
  const entries: { key: string; value: string; description: string }[] = [];
  for (const key of keys) {
    const keyError = validateKey(key);
    if (keyError) return { error: `${key}: ${keyError}` };

    const description = String(formData.get(`description:${key}`) ?? "").trim();
    const descriptionError = validateDescription(description);
    if (descriptionError) return { error: `${key}: ${descriptionError}` };

    // Read once, held only in this local for the duration of the call.
    const value = String(formData.get(`value:${key}`) ?? "");
    if (!value) return { error: `Enter a value for ${key}, or untick it.` };

    entries.push({ key, value, description });
  }

  // Preflight only — RLS's own INSERT policy is what enforces this.
  const access = await requireTeamAccess(teamId, "member", CREATE_DENIED);
  if (!access.ok) return { error: access.error };

  const supabase = await createClient();

  const { data: environment } = await supabase
    .from("environments")
    .select("id")
    .eq("id", environmentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!environment) {
    return { error: "That environment no longer exists." };
  }

  // Named up front so a collision reads as "STRIPE_SECRET_KEY is already
  // here" rather than a single opaque 23505 for a batch of twelve. The
  // insert below is one statement, so a conflict would roll the whole thing
  // back anyway — this exists to say which row caused it.
  const { data: existing } = await supabase
    .from("variables")
    .select("key")
    .eq("environment_id", environmentId)
    .in(
      "key",
      entries.map((entry) => entry.key),
    );

  if (existing && existing.length > 0) {
    const names = existing.map((row) => row.key).join(", ");
    return {
      error: `Already in this environment: ${names}. Untick those, or edit them from the variables list.`,
    };
  }

  const { data: created, error } = await supabase
    .from("variables")
    .insert(
      entries.map((entry) => {
        const encrypted = encryptSecret(entry.value);
        return {
          environment_id: environmentId,
          key: entry.key,
          encrypted_value: encrypted.encryptedValue,
          encrypted_dek: encrypted.encryptedDek,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          description: entry.description || null,
          created_by: access.userId,
          updated_by: access.userId,
        };
      }),
    )
    .select("id, key");

  if (error || !created) {
    return {
      error:
        error?.code === "23505"
          ? "One of those variables was added by someone else just now. Reload and try again."
          : "Could not save these variables. Try again.",
    };
  }

  // One row per variable, matching what createVariable() writes — an audit
  // trail that collapsed a batch into a single entry would read as one event
  // to anyone reviewing it later. `source` records that the *names* came from
  // the generator; the values did not, and nothing here records them.
  await Promise.all(
    created.map((row) =>
      logAudit({
        teamId,
        userId: access.userId,
        action: "create",
        targetType: "variable",
        targetId: row.id,
        environmentId,
        metadata: { key: row.key, source: "ai-generator" },
      }),
    ),
  );

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);
  // Back to the environment, where the new variables are now listed — the
  // list itself is the confirmation, and there's nothing left on the
  // generator page worth returning to. redirect() throws internally, so it
  // stays outside any try/catch and after every await that matters.
  redirect(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);
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
  // The key name only — not secret, just context for the audit row below.
  const key = String(formData.get("key") ?? "");

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

  await logAudit({
    teamId,
    userId: access.userId,
    action: "delete",
    targetType: "variable",
    targetId: variableId,
    environmentId,
    metadata: key ? { key } : null,
  });

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/${environmentName}`);

  return { error: null };
}
