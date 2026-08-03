/**
 * Phase 43 demo-mode lockdown test — the phase's real security claim:
 * a visitor holding the public demo account's credentials cannot change
 * anything.
 *
 * Run: npm run test:demo
 *
 * Signs in as the demo account through a plain anon-key client (never the
 * service role) and attempts every category of write the app supports. The
 * enforcement being tested is the set of RESTRICTIVE RLS policies from the
 * Phase 43 migration — not the server actions, which this script bypasses
 * entirely by talking to PostgREST directly. That's the point: if the only
 * thing stopping a demo visitor were `requireTeamAccess`, every assertion
 * below would still pass in the browser and fail here.
 *
 * **The methodological trap this script is built around, and the reason
 * every check re-reads through the service role:** Postgres RLS does not
 * raise on a denied UPDATE or DELETE. It matches zero rows and returns
 * `error: null`. A test that waits for an error passes even when the policy
 * does nothing at all. So each denial is asserted two ways — the write
 * affected no rows, *and* the underlying row is unchanged when read back
 * with RLS bypassed.
 *
 * Requires `npm run seed` to have been run, and the Phase 43 migration to
 * have been applied.
 *
 * Read-only in effect: every write it attempts is supposed to fail, and the
 * one write that is supposed to succeed (an audit row — the documented
 * exemption) is deleted again at the end.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const { createAdminClient } = await import("../lib/supabase/admin");
const { supabaseUrl, supabaseAnonKey } = await import("../lib/supabase/env");
const { DEMO_ACCOUNT_EMAIL, DEMO_PASSWORD, DEMO_TEAM_NAME } = await import("../lib/demo/fixture");
const { slugify } = await import("../lib/teams/slug");

const admin = createAdminClient();

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

async function main() {
  // ---------------------------------------------------------------------
  // Fixtures, resolved through the service role.
  // ---------------------------------------------------------------------

  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("slug", slugify(DEMO_TEAM_NAME))
    .maybeSingle();

  if (!team) {
    console.error(`No demo team "${DEMO_TEAM_NAME}" — run \`npm run seed\` first.`);
    process.exit(1);
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, name, environments(id, name)")
    .eq("team_id", team.id)
    .limit(1)
    .maybeSingle();

  const environmentId = project?.environments?.[0]?.id;
  if (!project || !environmentId) {
    console.error("Demo team has no project/environment — run `npm run seed` first.");
    process.exit(1);
  }

  const { data: variable } = await admin
    .from("variables")
    .select("id, key, encrypted_value")
    .eq("environment_id", environmentId)
    .limit(1)
    .maybeSingle();

  if (!variable) {
    console.error("Demo environment has no variables — run `npm run seed` first.");
    process.exit(1);
  }

  // ---------------------------------------------------------------------
  // Sign in as the demo account, exactly as the one-click button does.
  // ---------------------------------------------------------------------

  const demo: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey);
  const { data: session, error: signInError } = await demo.auth.signInWithPassword({
    email: DEMO_ACCOUNT_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (signInError || !session.user) {
    console.error(`Could not sign in as ${DEMO_ACCOUNT_EMAIL}: ${signInError?.message}`);
    process.exit(1);
  }
  const demoUserId = session.user.id;

  const { data: demoProfile } = await admin
    .from("profiles")
    .select("is_demo, display_name")
    .eq("id", demoUserId)
    .maybeSingle();

  check("the demo account is flagged is_demo in the database", demoProfile?.is_demo === true);

  // ---------------------------------------------------------------------
  // It must still be able to READ — a demo that can't read has nothing to
  // demo, and SELECT is deliberately untouched by the Phase 43 policies.
  // ---------------------------------------------------------------------

  const { data: readTeams } = await demo.from("teams").select("id");
  check("can read teams", (readTeams?.length ?? 0) > 0);

  const { data: readProjects } = await demo.from("projects").select("id");
  check("can read projects", (readProjects?.length ?? 0) > 0);

  const { data: readVariables } = await demo.from("variables").select("id, key");
  check("can read variables (metadata)", (readVariables?.length ?? 0) > 0);

  const { data: readScans } = await demo.from("security_scans").select("id, score");
  check(
    "can read persisted security scans",
    Array.isArray(readScans),
    `${readScans?.length ?? 0} scan row(s)`,
  );

  // ---------------------------------------------------------------------
  // It must not be able to WRITE anything.
  // ---------------------------------------------------------------------

  // INSERT is the one command RLS *does* raise on, so these assert an error.
  const { error: insertVariableError } = await demo.from("variables").insert({
    environment_id: environmentId,
    key: "DEMO_SHOULD_NOT_EXIST",
    encrypted_value: "x",
    encrypted_dek: "x",
    iv: "x",
    auth_tag: "x",
  });
  check("cannot insert a variable", insertVariableError !== null, insertVariableError?.code);

  const { error: insertProjectError } = await demo
    .from("projects")
    .insert({ team_id: team.id, name: "Demo Should Not Exist" });
  check("cannot insert a project", insertProjectError !== null, insertProjectError?.code);

  const { error: insertMemberError } = await demo
    .from("team_members")
    .insert({ team_id: team.id, user_id: demoUserId, role: "admin" });
  check("cannot insert a team member", insertMemberError !== null, insertMemberError?.code);

  const { error: insertScanError } = await demo
    .from("security_scans")
    .insert({ project_id: project.id, environment_id: environmentId, score: 100, issues: [] });
  check("cannot insert a security scan", insertScanError !== null, insertScanError?.code);

  // UPDATE/DELETE: assert zero rows affected AND the row unchanged. An
  // error here is not expected and not required — silence is the failure
  // mode being guarded against.
  const { data: updatedVariable } = await demo
    .from("variables")
    .update({ key: "DEMO_TAMPERED" })
    .eq("id", variable.id)
    .select("id");
  const { data: variableAfter } = await admin
    .from("variables")
    .select("key")
    .eq("id", variable.id)
    .maybeSingle();
  check(
    "cannot update a variable (zero rows, and the row is untouched)",
    (updatedVariable?.length ?? 0) === 0 && variableAfter?.key === variable.key,
  );

  const { data: deletedVariable } = await demo
    .from("variables")
    .delete()
    .eq("id", variable.id)
    .select("id");
  const { count: variableStillThere } = await admin
    .from("variables")
    .select("id", { count: "exact", head: true })
    .eq("id", variable.id);
  check(
    "cannot delete a variable (zero rows, and the row still exists)",
    (deletedVariable?.length ?? 0) === 0 && variableStillThere === 1,
  );

  const { data: updatedTeam } = await demo
    .from("teams")
    .update({ name: "Tampered Team" })
    .eq("id", team.id)
    .select("id");
  const { data: teamAfter } = await admin
    .from("teams")
    .select("name")
    .eq("id", team.id)
    .maybeSingle();
  check(
    "cannot rename the team (zero rows, and the name is unchanged)",
    (updatedTeam?.length ?? 0) === 0 && teamAfter?.name === team.name,
  );

  // ---------------------------------------------------------------------
  // The two checks that prove the RESTRICTIVE policies do something the
  // `readonly` role alone does not. Every denial above is also enforced by
  // the readonly role, so on its own none of it distinguishes "the demo
  // lockdown works" from "readonly works".
  // ---------------------------------------------------------------------

  const { data: updatedProfile } = await demo
    .from("profiles")
    .update({ display_name: "Tampered By Demo" })
    .eq("id", demoUserId)
    .select("id");
  const { data: profileAfter } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", demoUserId)
    .maybeSingle();
  check(
    "cannot edit its own profile — a plain readonly member CAN, so this is the demo policy",
    (updatedProfile?.length ?? 0) === 0 &&
      profileAfter?.display_name === (demoProfile?.display_name ?? null),
  );

  const { error: createTeamError } = await demo.rpc("create_team", {
    p_name: "Demo Tamper Team",
    p_slug: `demo-tamper-${Date.now()}`,
  });
  const { count: tamperTeams } = await admin
    .from("teams")
    .select("id", { count: "exact", head: true })
    .like("slug", "demo-tamper-%");
  check(
    "cannot create a team — any authenticated user CAN, so this is the demo policy",
    createTeamError !== null && tamperTeams === 0,
    createTeamError?.code,
  );

  // It also must not be able to clear its own demo flag. Phase 16's column
  // grant is what stops this, not a policy — worth pinning, because a
  // future migration widening that grant would silently unlock everything
  // above.
  const { error: unflagError } = await demo
    .from("profiles")
    .update({ is_demo: false })
    .eq("id", demoUserId);
  const { data: stillDemo } = await admin
    .from("profiles")
    .select("is_demo")
    .eq("id", demoUserId)
    .maybeSingle();
  check(
    "cannot clear its own is_demo flag",
    stillDemo?.is_demo === true,
    unflagError ? `rejected: ${unflagError.code}` : "no error, but flag intact",
  );

  // ---------------------------------------------------------------------
  // The one documented exemption: audit_logs stays writable, so a reveal in
  // the demo appears in the activity feed the way it would for a real user.
  // ---------------------------------------------------------------------

  const { data: auditRow, error: auditError } = await demo
    .from("audit_logs")
    .insert({
      team_id: team.id,
      user_id: demoUserId,
      action: "read",
      target_type: "variable",
      target_id: variable.id,
      environment_id: environmentId,
      metadata: { key: variable.key, source: "test-demo" },
    })
    .select("id")
    .maybeSingle();

  check(
    "CAN append to the audit log (the one deliberate exemption)",
    auditError === null && auditRow !== null,
    auditError?.message,
  );

  // Still bounded: it can only ever write rows attributed to itself.
  const { error: forgedAuditError } = await demo.from("audit_logs").insert({
    team_id: team.id,
    user_id: "00000000-0000-0000-0000-000000000000",
    action: "delete",
    target_type: "variable",
    target_id: variable.id,
  });
  check(
    "cannot forge an audit row attributed to someone else",
    forgedAuditError !== null,
    forgedAuditError?.code,
  );

  if (auditRow) {
    await admin.from("audit_logs").delete().eq("id", auditRow.id);
  }

  // ---------------------------------------------------------------------

  const failed = results.filter((result) => !result.pass);
  console.log("");
  for (const result of results) {
    console.log(
      `${result.pass ? "PASS" : "FAIL"} — ${result.name}${result.detail ? ` (${result.detail})` : ""}`,
    );
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Demo lockdown test crashed:", error);
  process.exit(1);
});
