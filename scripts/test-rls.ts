/**
 * Phase 11 RLS smoke test — proves cross-team row isolation is enforced by
 * Postgres itself, not just by the app's own query filters.
 *
 * Run: npm run test:rls
 *
 * Two checks:
 *
 * 1. Cross-team isolation: creates two throwaway teams, each with its own
 *    throwaway user, using the service-role client (bypasses RLS — fixture
 *    setup only). Then signs in as each user through a plain anon-key
 *    client, the same path the real app uses, and asserts that user A gets
 *    zero rows querying team B's data (and vice versa) while still seeing
 *    their own team's data, then confirms a cross-team INSERT is rejected
 *    too.
 *
 * 2. create_team() bootstrap (Phase 13): a brand-new user, with the admin
 *    client used only to create their auth account — everything else goes
 *    through their own signed-in client — calls the create_team() RPC and
 *    asserts they land in team_members as admin and can immediately read
 *    the team back. This specifically exercises the team_members INSERT
 *    policy's bootstrap clause, which check #1 never touches (it seeds
 *    team_members via the admin client, bypassing RLS entirely) — and which
 *    had a real bug: its own subqueries against teams/team_members were
 *    themselves filtered by those tables' SELECT policies, which made the
 *    bootstrap check always fail. Fixed in
 *    20260729180000_fix_team_bootstrap_policy.sql.
 *
 * Always cleans up everything it creates — teams, projects, and every
 * throwaway auth user — even if an assertion fails or throws.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

// Deferred until after dotenv has loaded: lib/supabase/env.ts reads
// NEXT_PUBLIC_SUPABASE_URL/ANON_KEY at module-load time, so importing it
// before loadEnv() runs would throw.
const { createAdminClient } = await import("../lib/supabase/admin");
const { supabaseUrl, supabaseAnonKey } = await import("../lib/supabase/env");
const { createClient } = await import("@supabase/supabase-js");

const runId = Date.now();
const admin = createAdminClient();

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function createTestUser(label: string) {
  const email = `rls-test-${label}-${runId}@example.com`;
  const password = crypto.randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${label}: ${error?.message}`);
  }

  const signedInClient = createClient(supabaseUrl, supabaseAnonKey);
  const { error: signInError } = await signedInClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw new Error(`Failed to sign in test user ${label}: ${signInError.message}`);
  }

  return { userId: data.user.id, client: signedInClient };
}

async function testCrossTeamIsolation() {
  const userA = await createTestUser("a");
  const userB = await createTestUser("b");

  let teamAId: string | undefined;
  let teamBId: string | undefined;

  try {
    // --- Fixture setup (service-role client, bypasses RLS) ---
    const { data: teamA, error: teamAError } = await admin
      .from("teams")
      .insert({
        name: "RLS Test Team Alpha",
        slug: `rls-test-alpha-${runId}`,
        created_by: userA.userId,
      })
      .select()
      .single();
    if (teamAError || !teamA) throw new Error(`Team A setup failed: ${teamAError?.message}`);
    teamAId = teamA.id;

    const { data: teamB, error: teamBError } = await admin
      .from("teams")
      .insert({
        name: "RLS Test Team Beta",
        slug: `rls-test-beta-${runId}`,
        created_by: userB.userId,
      })
      .select()
      .single();
    if (teamBError || !teamB) throw new Error(`Team B setup failed: ${teamBError?.message}`);
    teamBId = teamB.id;

    const { error: memberAError } = await admin
      .from("team_members")
      .insert({ team_id: teamAId, user_id: userA.userId, role: "admin" });
    if (memberAError) throw new Error(`Member A setup failed: ${memberAError.message}`);

    const { error: memberBError } = await admin
      .from("team_members")
      .insert({ team_id: teamBId, user_id: userB.userId, role: "admin" });
    if (memberBError) throw new Error(`Member B setup failed: ${memberBError.message}`);

    const { data: projectA, error: projectAError } = await admin
      .from("projects")
      .insert({ team_id: teamAId, name: "Alpha Project", created_by: userA.userId })
      .select()
      .single();
    if (projectAError || !projectA) {
      throw new Error(`Project A setup failed: ${projectAError?.message}`);
    }

    const { error: projectBError } = await admin
      .from("projects")
      .insert({ team_id: teamBId, name: "Beta Project", created_by: userB.userId });
    if (projectBError) throw new Error(`Project B setup failed: ${projectBError.message}`);

    // --- Assertions, run as each signed-in user through the anon-key client ---

    const { data: ownTeam } = await userA.client
      .from("teams")
      .select("id")
      .eq("id", teamAId);
    check("user A can see their own team", (ownTeam?.length ?? 0) === 1);

    const { data: crossTeam } = await userA.client
      .from("teams")
      .select("id")
      .eq("id", teamBId);
    check("user A gets zero rows querying team B's teams row", (crossTeam?.length ?? 0) === 0);

    const { data: crossMembers } = await userA.client
      .from("team_members")
      .select("id")
      .eq("team_id", teamBId);
    check(
      "user A gets zero rows querying team B's team_members",
      (crossMembers?.length ?? 0) === 0,
    );

    const { data: ownProjects } = await userA.client
      .from("projects")
      .select("id")
      .eq("team_id", teamAId);
    check("user A can see team A's own project", (ownProjects?.length ?? 0) === 1);

    const { data: crossProjects } = await userA.client
      .from("projects")
      .select("id")
      .eq("team_id", teamBId);
    check(
      "user A gets zero rows querying team B's projects",
      (crossProjects?.length ?? 0) === 0,
    );

    const { error: crossInsertError } = await userA.client
      .from("projects")
      .insert({ team_id: teamBId, name: "Should be rejected" });
    check(
      "user A is rejected inserting a project into team B",
      Boolean(crossInsertError),
    );

    // Symmetric check from user B's side, to rule out a policy that just
    // happens to favor whichever team was created first.
    const { data: bCrossTeam } = await userB.client
      .from("teams")
      .select("id")
      .eq("id", teamAId);
    check("user B gets zero rows querying team A's teams row", (bCrossTeam?.length ?? 0) === 0);
  } finally {
    // Cascades to team_members/projects/environments/variables for both teams.
    if (teamAId) await admin.from("teams").delete().eq("id", teamAId);
    if (teamBId) await admin.from("teams").delete().eq("id", teamBId);
    await admin.auth.admin.deleteUser(userA.userId);
    await admin.auth.admin.deleteUser(userB.userId);
  }
}

async function testCreateTeamBootstrap() {
  const userC = await createTestUser("c");
  let teamCId: string | undefined;

  try {
    const slug = `rls-test-gamma-${runId}`;
    const { data: team, error } = await userC.client.rpc("create_team", {
      p_name: "RLS Test Team Gamma",
      p_slug: slug,
    });

    check("create_team succeeds for a brand-new user", !error, error?.message);
    if (error || !team) return;
    teamCId = team.id;

    check("create_team returns the expected slug", team.slug === slug);

    const { data: membership } = await userC.client
      .from("team_members")
      .select("role")
      .eq("team_id", teamCId)
      .eq("user_id", userC.userId)
      .maybeSingle();
    check("the creator is inserted as admin in the same call", membership?.role === "admin");

    const { data: ownTeam } = await userC.client.from("teams").select("id").eq("id", teamCId);
    check("the creator can immediately read their own new team", (ownTeam?.length ?? 0) === 1);
  } finally {
    if (teamCId) await admin.from("teams").delete().eq("id", teamCId);
    await admin.auth.admin.deleteUser(userC.userId);
  }
}

async function main() {
  await testCrossTeamIsolation();
  await testCreateTeamBootstrap();

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("RLS test script crashed:", error);
  process.exit(1);
});
