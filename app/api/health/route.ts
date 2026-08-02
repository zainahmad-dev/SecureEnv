import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type DatabaseCheck = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

// Queries auth.users via the admin API rather than a `public` table, so this
// check works even before any app schema exists (Phase 8+) and isn't affected
// by Row Level Security.
async function checkDatabase(): Promise<DatabaseCheck> {
  const startedAt = Date.now();

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      throw error;
    }

    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    // This route is unauthenticated and public by design (middleware's own
    // PUBLIC_PATHS, Phase 6) — a raw connection/driver error could otherwise
    // hand anyone hitting it internal details (hostnames, error codes,
    // occasionally more). Log the real error server-side only; the client
    // gets nothing beyond "the database check failed."
    console.error("Health check database probe failed:", err);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: "Database check failed.",
    };
  }
}

export async function GET() {
  const database = await checkDatabase();
  const status = database.ok ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      database,
    },
    { status: database.ok ? 200 : 503 },
  );
}

// Never statically render or cache this route — every hit must re-check the
// database live, and `next build` must not call out to Supabase at build time.
export const dynamic = "force-dynamic";
