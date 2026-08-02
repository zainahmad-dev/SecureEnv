"use server";

import {
  AIMalformedResponseError,
  AIRateLimitError,
  AIRefusalError,
  AITimeoutError,
  PromptContainsSecretError,
} from "@/lib/ai/client";
import { generateEnvSuggestions } from "@/lib/ai/generator/generate";
import type { SuggestedVariable } from "@/lib/ai/generator/schema";
import { NOTES_MAX_LENGTH, resolveServiceLabels } from "@/lib/ai/generator/services";
import { AIUserRateLimitedError, enforceAiRateLimit } from "@/lib/ai/rate-limit";
import { requireTeamAccess } from "@/lib/auth/team-access";

const GENERATE_DENIED = "Only team admins and members can generate variables.";

/**
 * Every failure carries `retryable`, which is the whole point of this shape:
 * the phase's rule is "handle failure with a retry option, never a dead
 * spinner", and a Retry button is only honest when trying again could
 * actually work. A timeout or a busy provider is worth retrying; a prompt
 * the guard rejected, or an hourly limit the user has already hit, is not —
 * those get an instruction instead of a button that would fail identically.
 */
export type GenerateSuggestionsState =
  | { status: "idle" }
  | { status: "ok"; suggestions: SuggestedVariable[] }
  | { status: "error"; error: string; retryable: boolean };

function describeFailure(error: unknown): { error: string; retryable: boolean } {
  if (error instanceof PromptContainsSecretError) {
    return {
      error:
        "Those notes look like they contain a real secret value. Describe your stack in words instead — SecureEnv never sends a value to the AI provider.",
      retryable: false,
    };
  }

  if (error instanceof AIUserRateLimitedError) {
    return { error: error.message, retryable: false };
  }

  if (error instanceof AIRateLimitError) {
    return { error: "The AI provider is busy right now. Try again in a moment.", retryable: true };
  }

  if (error instanceof AITimeoutError) {
    return { error: "The AI provider took too long to respond.", retryable: true };
  }

  if (error instanceof AIMalformedResponseError) {
    return {
      error: "The AI provider sent back something we couldn't read.",
      retryable: true,
    };
  }

  if (error instanceof AIRefusalError) {
    return {
      error: "The AI provider declined that request. Try fewer services, or rephrase your notes.",
      retryable: true,
    };
  }

  return { error: "Couldn't reach the AI provider. Try again.", retryable: true };
}

export async function generateSuggestions(
  _prevState: GenerateSuggestionsState,
  formData: FormData,
): Promise<GenerateSuggestionsState> {
  const teamId = String(formData.get("teamId") ?? "");
  const notes = String(formData.get("notes") ?? "")
    .trim()
    .slice(0, NOTES_MAX_LENGTH);

  // Unknown ids are dropped rather than rejected — the checkbox values come
  // from the same catalogue the server validates against, so a mismatch
  // means a stale page, not a user mistake worth an error message about.
  const services = resolveServiceLabels(formData.getAll("services").map(String));

  if (services.length === 0 && !notes) {
    return {
      status: "error",
      error: "Pick at least one service, or describe your stack in the notes field.",
      retryable: false,
    };
  }

  if (!teamId) {
    return {
      status: "error",
      error: "Something went wrong. Reload the page and try again.",
      retryable: false,
    };
  }

  // Generating writes nothing, so RLS has no say here — this call is the
  // only thing standing between a readonly member (or a non-member with a
  // team id) and the team's AI quota. "member" matches the threshold for
  // actually adding a variable: a readonly member couldn't act on the
  // results anyway.
  const access = await requireTeamAccess(teamId, "member", GENERATE_DENIED);
  if (!access.ok) return { status: "error", error: access.error, retryable: false };

  try {
    await enforceAiRateLimit();
    const suggestions = await generateEnvSuggestions({ services, notes });

    if (suggestions.length === 0) {
      return {
        status: "error",
        error: "The AI provider didn't suggest any variables for that. Try naming a service.",
        retryable: true,
      };
    }

    return { status: "ok", suggestions };
  } catch (error) {
    const described = describeFailure(error);
    // The error's own message only — never the prompt, and never
    // AIMalformedResponseError's `raw` field. Neither is a secret by policy,
    // but the notes field is free text a user typed, and server logs are not
    // where user input belongs by default.
    console.error(
      `AI generator failed (${error instanceof Error ? error.name : "unknown"}):`,
      error instanceof Error ? error.message : error,
    );
    return { status: "error", ...described };
  }
}
