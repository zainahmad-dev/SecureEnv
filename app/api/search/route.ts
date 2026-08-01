import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { searchTeam } from "@/lib/search/queries";

// GET, not a server action: the global search box calls this on every
// debounced keystroke via fetch(), which a server action can't be invoked
// from without a form/transition. A plain 401 JSON on failure rather than
// requireTeamAccess()'s redirect() — same reasoning as the reveal route
// (Phase 26): this is called from client JS, not navigated to, and a
// redirect response would just fail to parse as JSON.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const q = searchParams.get("q") ?? "";

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!teamId) {
    return NextResponse.json({ projects: [], variables: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  // No explicit membership check beyond authentication — searchTeam()'s own
  // queries run through the RLS-bound client, so a teamId the caller isn't
  // actually a member of just yields empty results, the same
  // indistinguishable-from-nonexistent pattern getTeamAccess uses elsewhere.
  const results = await searchTeam(teamId, q);

  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
