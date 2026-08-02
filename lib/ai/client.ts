import type { z } from "zod";
import { assertNoSecretLikeContent, PromptContainsSecretError } from "@/lib/ai/guard";

// Re-exported so existing call sites can keep importing both the client and
// the guard from one place; lib/ai/guard.ts is what actually defines them.
export { assertNoSecretLikeContent, PromptContainsSecretError };

/**
 * Groq's OpenAI-compatible chat completions endpoint. Server-only by
 * convention, not the `server-only` package — that package throws under
 * any plain Node/tsx execution (not just a real client bundle), which broke
 * both this project's Vitest suite and its scripts/test-*.ts convention
 * (both run via tsx, never through Next's bundler). Every other server-only
 * module in this codebase (lib/supabase/admin.ts, lib/crypto/master-key.ts)
 * already relies on the same convention instead: read the secret lazily
 * inside a function, never at module top level, and never import this
 * module from a "use client" component. GROQ_API_KEY must never reach the
 * browser.
 */
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Overridable via env rather than hardcoded only — Groq's model lineup
// changes over time, and a deprecated default shouldn't require a code
// change to fix.
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT_MS = 20_000;

/** Base class for every error this module raises — lets a caller catch all of them at once with one `instanceof` check, then narrow further if it cares which one. */
export abstract class AIClientError extends Error {}

/**
 * The response either wasn't valid JSON, had no content at all, or didn't
 * match the caller's schema. All three collapse into one type: from a
 * caller's perspective, "the shape I needed isn't here" is one failure
 * mode, however it happened. `raw` carries the original text (if any) for
 * logging — never anything sourced from the caller's own prompt.
 */
export class AIMalformedResponseError extends AIClientError {
  constructor(
    message: string,
    public readonly raw?: string,
  ) {
    super(message);
    this.name = "AIMalformedResponseError";
  }
}

/** The model declined to answer — Groq/OpenAI's own `refusal` field, or a `content_filter` finish reason. */
export class AIRefusalError extends AIClientError {
  constructor(message: string) {
    super(message);
    this.name = "AIRefusalError";
  }
}

/** The request didn't complete within `timeoutMs`. Distinct from a generic network failure so callers can offer a specific "try again" versus a "something's wrong" message. */
export class AITimeoutError extends AIClientError {
  constructor(message: string) {
    super(message);
    this.name = "AITimeoutError";
  }
}

/** Groq itself rate-limited this request (HTTP 429) — the upstream provider's limit, distinct from this app's own per-user limit in lib/ai/rate-limit.ts. */
export class AIRateLimitError extends AIClientError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AIRateLimitError";
  }
}

/** The request reached the network but failed for some other reason (DNS, connection reset, non-2xx that isn't a rate limit) — not one of the four categories above, but still worth its own type rather than an unchecked throw. */
export class AIRequestError extends AIClientError {
  constructor(message: string) {
    super(message);
    this.name = "AIRequestError";
  }
}

/** LLMs asked for JSON occasionally wrap it in a markdown fence even under json_object mode's constrained decoding — a cheap, safe unwrap before the real parse. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export type CallAIOptions<T> = {
  /** The user-facing instruction. Checked for secret-shaped content before anything else — including before the API key is even read. */
  prompt: string;
  /** Optional system prompt. Checked the same way `prompt` is. */
  system?: string;
  /** What shape the parsed JSON must match. */
  schema: z.ZodType<T>;
  timeoutMs?: number;
  model?: string;
};

/**
 * Calls Groq's chat completions endpoint in JSON mode and returns the
 * response parsed and validated against `schema`. Throws one of the typed
 * errors above on any failure — never returns a partial or unvalidated
 * result.
 */
export async function callAI<T>({
  prompt,
  system,
  schema,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  model,
}: CallAIOptions<T>): Promise<T> {
  assertNoSecretLikeContent(prompt);
  if (system) assertNoSecretLikeContent(system);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY environment variable.");
  }

  const messages = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    // Groq's json_object mode requires the literal word "json" to appear
    // somewhere in the conversation, or the API rejects the request outright
    // regardless of how the prompt itself is phrased.
    { role: "user" as const, content: `${prompt}\n\nRespond with a single JSON object only — no prose, no markdown fence.` },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AITimeoutError(`AI request timed out after ${timeoutMs}ms.`);
    }
    throw new AIRequestError(
      `Network error calling the AI provider: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
    throw new AIRateLimitError("The AI provider is rate-limiting this request.", retryAfterMs);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AIRequestError(`AI provider returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0];

  if (!choice) {
    throw new AIMalformedResponseError("AI response had no choices.");
  }

  // Groq/OpenAI-style refusal signals: either a dedicated `refusal` field
  // (structured-output refusals) or a finish_reason indicating the model's
  // safety layer intercepted the request rather than actually answering it.
  if (choice.message?.refusal || choice.finish_reason === "content_filter") {
    throw new AIRefusalError(choice.message?.refusal || "The AI provider refused to answer this prompt.");
  }

  const content: string | undefined = choice.message?.content;
  if (!content) {
    throw new AIMalformedResponseError("AI response had no content.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFence(content));
  } catch {
    throw new AIMalformedResponseError("AI response was not valid JSON.", content);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new AIMalformedResponseError(
      `AI response did not match the expected shape: ${result.error.message}`,
      content,
    );
  }

  return result.data;
}
