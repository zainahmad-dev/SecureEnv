import "server-only";
import { createClient } from "@/lib/supabase/server";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 20;

export class AIUserRateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super("You've reached the AI usage limit for this hour. Try again later.");
    this.name = "AIUserRateLimitedError";
  }
}

/**
 * Per-user, per-hour rate limiting for AI endpoints (Phase 37) — separate
 * from callAI()'s own AIRateLimitError, which is Groq's *upstream* limit.
 * This one is ours: it exists so one user can't burn through the shared
 * Groq quota (or run up cost, on a paid tier) for the whole team.
 *
 * Backed by Postgres, not an in-memory counter — a serverless deployment
 * doesn't share memory reliably across invocations, so an in-process Map
 * would silently under-count (or reset) depending on which instance
 * happened to handle a given request. The increment itself is a single
 * atomic upsert (increment_ai_rate_limit()), so concurrent requests from
 * the same user can't race past the limit.
 *
 * Call this before callAI(), inside every AI-facing route handler or
 * server action — it does not call callAI() itself, so nothing enforces
 * this automatically; it's on each call site the same way requireTeamAccess()
 * is.
 */
export async function enforceAiRateLimit(): Promise<void> {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("increment_ai_rate_limit", {
    p_window_start: windowStart.toISOString(),
  });

  if (error) {
    // Fail open: a hiccup in our own rate-limit bookkeeping shouldn't take
    // down every AI feature in the app. This is a cost/abuse control, not
    // an authorization boundary — unlike an auth check, it's fine for it to
    // occasionally let a request through uncounted rather than block
    // everyone. Logged so a real, persistent failure is still visible.
    console.error("AI rate limit check failed, allowing the request:", error.message);
    return;
  }

  if (data > MAX_REQUESTS_PER_WINDOW) {
    const retryAfterMs = windowStart.getTime() + WINDOW_MS - Date.now();
    throw new AIUserRateLimitedError(retryAfterMs);
  }
}
