/**
 * Phase 18 auto-create-environments smoke test.
 *
 * Run: npm run test:environments
 *
 * Covers three things that are each easy to get subtly wrong:
 *   1. create_project() actually creates all three default environments, in
 *      the right sort order, for both an admin and a member creator (Phase
 *      17 lets both create projects; Phase 18's environments INSERT policy
 *      has to allow both too, or a member's project creation would roll back
 *      entirely when the environment inserts failed).
 *   2. The default environments can never be renamed or deleted, by anyone,
 *      while a custom environment can be — by an admin, not by a member.
 *   3. Deleting a project still cascades through its (default) environments
 *      — the trigger that protects defaults from a direct delete must not
 *      also block the cascade that happens when their parent project goes.
 *
 * As in the members/projects test scripts: INSERT denials raise an error
 * outright, but UPDATE/DELETE denials (whether from RLS or from the
 * default-environment triggers) return `error` with a code, not a thrown
 * exception from the client's perspective — checked via error.code, and via
 * zero affected rows for a plain RLS denial.
 *
 * Requires the Phase 18 migration to be applied.
 */

import { config as loadEnv } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

loadEnv({ path: ".env.local" });

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

type TestUser = { userId: string; email: string; client: SupabaseClient<Database> };

const createdUserIds = new Set<string>();
const createdTeamIds = new Set<string>();

async function createTestUser(label: string): Promise<TestUser> {
  const email = `env-test-${label}-${runId}@example.com`;
  const password = crypto.randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${label}: ${error?.message}`);
  }
  createdUserIds.add(data.user.id);

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in test user ${label}: ${signInError.message}`);
  }

  return { userId: data.user.id, email, client };
}

async function main() {
  const owner = await createTestUser("owner");
  const member = await createTestUser("member");
  const readonly = await createTestUser("readonly");
  const outsider = await createTestUser("outsider");

  try {
    const { data: team, error: teamError } = await owner.client.rpc("create_team", {
      p_name: "Environments Test",
      p_slug: `env-test-${runId}`,
    });
    if (teamError || !team) throw new Error(`create_team failed: ${teamError?.message}`);
    createdTeamIds.add(team.id);

    // Fixture only — service-role insert, bypassing RLS deliberately.
    const { error: seedError } = await admin.from("team_members").insert([
      { team_id: team.id, user_id: member.userId, role: "member" },
      { team_id: team.id, user_id: readonly.userId, role: "readonly" },
    ]);
    if (seedError) throw new Error(`Seeding members failed: ${seedError.message}`);

    // -------------------------------------------------------------------
    // 1. create_project() seeds all three defaults, in sort order, for
    //    both an admin and a member creator.
    // -------------------------------------------------------------------

    const { data: adminProject, error: adminCreateError } = await owner.client.rpc(
      "create_project",
      { p_team_id: team.id, p_name: "Admin's Project" },
    );
    check(
      "an admin's create_project call succeeds",
      !adminCreateError && Boolean(adminProject),
      adminCreateError?.message,
    );

    const { data: adminEnvs } = await admin
      .from("environments")
      .select("name, sort_order")
      .eq("project_id", adminProject?.id ?? "")
      .order("sort_order", { ascending: true });
    check(
      "the admin's project got all three default environments in order",
      JSON.stringify(adminEnvs?.map((e) => e.name)) ===
        JSON.stringify(["development", "staging", "production"]),
      JSON.stringify(adminEnvs),
    );

    const { data: memberProject, error: memberCreateError } = await member.client.rpc(
      "create_project",
      { p_team_id: team.id, p_name: "Member's Project" },
    );
    check(
      "a member's create_project call succeeds",
      !memberCreateError && Boolean(memberProject),
      memberCreateError?.message,
    );

    const { data: memberEnvs } = await admin
      .from("environments")
      .select("name, sort_order")
      .eq("project_id", memberProject?.id ?? "")
      .order("sort_order", { ascending: true });
    check(
      "the member's project also got all three default environments",
      JSON.stringify(memberEnvs?.map((e) => e.name)) ===
        JSON.stringify(["development", "staging", "production"]),
      JSON.stringify(memberEnvs),
    );

    const { error: readonlyCreateError } = await readonly.client.rpc("create_project", {
      p_team_id: team.id,
      p_name: "Readonly's Project",
    });
    check(
      "a readonly member cannot create a project",
      Boolean(readonlyCreateError),
      readonlyCreateError ? undefined : "create_project unexpectedly permitted",
    );

    const { error: outsiderCreateError } = await outsider.client.rpc("create_project", {
      p_team_id: team.id,
      p_name: "Outsider's Project",
    });
    check(
      "a non-member cannot create a project",
      Boolean(outsiderCreateError),
      outsiderCreateError ? undefined : "create_project unexpectedly permitted",
    );

    if (!adminProject || !memberProject) {
      throw new Error("Setup projects were not created — cannot continue.");
    }

    const { data: devEnvRow } = await admin
      .from("environments")
      .select("id")
      .eq("project_id", adminProject.id)
      .eq("name", "development")
      .single();

    // -------------------------------------------------------------------
    // 2. Custom environments: admin or member can add, readonly cannot
    // -------------------------------------------------------------------

    const { error: adminAddError } = await owner.client
      .from("environments")
      .insert({ project_id: adminProject.id, name: "qa", sort_order: 3 });
    check("an admin can add a custom environment", !adminAddError, adminAddError?.message);

    const { error: memberAddError } = await member.client
      .from("environments")
      .insert({ project_id: memberProject.id, name: "qa", sort_order: 3 });
    check("a member can add a custom environment", !memberAddError, memberAddError?.message);

    const { error: readonlyAddError } = await readonly.client
      .from("environments")
      .insert({ project_id: adminProject.id, name: "readonly-env", sort_order: 4 });
    check(
      "a readonly member cannot add a custom environment",
      Boolean(readonlyAddError),
      readonlyAddError ? undefined : "insert unexpectedly permitted",
    );

    const { data: qaEnv } = await admin
      .from("environments")
      .select("id")
      .eq("project_id", adminProject.id)
      .eq("name", "qa")
      .single();
    if (!qaEnv) throw new Error("Custom 'qa' environment was not created — cannot continue.");

    // -------------------------------------------------------------------
    // 3. Rename: admin-only for a custom environment, and no one can
    //    rename a default one.
    // -------------------------------------------------------------------

    const { data: renamed } = await owner.client
      .from("environments")
      .update({ name: "qa-renamed" })
      .eq("id", qaEnv.id)
      .select("id");
    check("an admin can rename a custom environment", renamed?.length === 1);

    const { data: memberRenameAttempt } = await member.client
      .from("environments")
      .update({ name: "hijacked" })
      .eq("id", qaEnv.id)
      .select("id");
    check(
      "a member cannot rename another custom environment",
      (memberRenameAttempt?.length ?? 0) === 0,
    );

    const { error: defaultRenameError } = await owner.client
      .from("environments")
      .update({ name: "dev" })
      .eq("id", devEnvRow?.id ?? "");
    check(
      "even an admin cannot rename a default environment",
      defaultRenameError?.code === "P0001",
      defaultRenameError ? `code=${defaultRenameError.code}` : "rename unexpectedly permitted",
    );

    // -------------------------------------------------------------------
    // 4. Delete: admin-only for a custom environment, defaults are never
    //    deletable directly, but a project delete still cascades through
    //    its default environments.
    // -------------------------------------------------------------------

    const { error: defaultDeleteError } = await owner.client
      .from("environments")
      .delete()
      .eq("id", devEnvRow?.id ?? "");
    check(
      "even an admin cannot delete a default environment directly",
      defaultDeleteError?.code === "P0001",
      defaultDeleteError ? `code=${defaultDeleteError.code}` : "delete unexpectedly permitted",
    );

    const { data: memberDeleteAttempt } = await member.client
      .from("environments")
      .delete()
      .eq("id", qaEnv.id)
      .select("id");
    check(
      "a member cannot delete a custom environment",
      (memberDeleteAttempt?.length ?? 0) === 0,
    );

    const { data: adminDelete } = await owner.client
      .from("environments")
      .delete()
      .eq("id", qaEnv.id)
      .select("id");
    check("an admin can delete a custom environment", adminDelete?.length === 1);

    const { error: deleteProjectError } = await owner.client
      .from("projects")
      .delete()
      .eq("id", adminProject.id);
    check(
      "deleting a project (with default environments still on it) succeeds",
      !deleteProjectError,
      deleteProjectError?.message,
    );

    const { count: survivingEnvironments } = await admin
      .from("environments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", adminProject.id);
    check(
      "deleting the project cascaded through its default environments",
      survivingEnvironments === 0,
    );
  } finally {
    for (const teamId of createdTeamIds) {
      await admin.from("teams").delete().eq("id", teamId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }

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
  console.error("Environments test script crashed:", error);
  process.exit(1);
});
