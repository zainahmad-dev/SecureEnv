import { NextResponse, type NextRequest } from "next/server";
import { resetDemoData } from "@/lib/demo/reset";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs the service-role reset — must never be prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * The scheduled half of "reset the demo data on a schedule or on demand".
 * Vercel Cron hits this on the schedule in vercel.json; scripts/reset-demo.ts
 * is the on-demand half, running the identical routine.
 *
 * **This is by some distance the most dangerous route in the app.** It runs
 * with the service-role client, which bypasses every RLS policy in the
 * database — including the Phase 43 ones that are the entire reason the
 * public demo account is safe to hand out. So it is also the only route here
 * that authenticates with a shared secret instead of a user session.
 *
 * Three deliberate choices follow from that:
 *
 * - **It fails closed.** With CRON_SECRET unset, every request is rejected.
 *   An unconfigured deployment loses its scheduled reset, which is a
 *   papercut; one that defaulted to open would lose its demo to anyone who
 *   guessed the URL.
 * - **GET is supported, because Vercel Cron issues GET** — and that is only
 *   acceptable because the bearer token is mandatory. A crawler, a link
 *   preview, or a prefetch reaching this URL has no token and gets a 401,
 *   which is exactly the scenario the fail-closed rule above protects.
 *   POST is accepted too, for a manual `curl` that would rather not send a
 *   mutating GET.
 * - **It is listed in middleware's PUBLIC_PATHS**, since there is no user
 *   session on a cron invocation — being "public" to the middleware and
 *   "secret-gated" in the handler is the same arrangement /api/health
 *   already uses, just with an actual gate.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
  // once that variable is set on the project.
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    // Deliberately does not distinguish "no secret configured" from "wrong
    // secret" — that difference is only useful to someone probing.
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const result = await resetDemoData(createAdminClient());
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    console.error("Demo reset failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { status: "failed", error: "Demo reset failed. See server logs." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
