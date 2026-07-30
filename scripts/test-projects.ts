/**
 * Phase 17 projects CRUD smoke test — proves the role rules on project
 * mutations are enforced by Postgres, not just by which buttons the UI shows.
 *
 * Run: npm run test:projects
 *
 * Creation is admin-or-member (Phase 17 loosened this from Phase 11's
 * admin-only default); rename and delete stay admin-only, unchanged from
 * Phase 11. Every check below goes through a signed-in user's own anon-key
 * client — the same path the browser takes — never the service-role client,
 * which only builds fixtures and cleans up.
 *
 * INSERT denials raise an error outright (no "old row" for RLS to just skip),
 * but UPDATE/DELETE denials are silent — they simply affect zero rows with
 * `error: null`. So the update/delete checks below assert on the returned
 * row count, not on whether an error was thrown, matching the lesson from
 * Phase 15's test script.
 *
 * Requires the Phase 17 migration to be applied.
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
  const email = `projects-test-${label}-${runId}@example.com`;
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
      p_name: "Projects Test",
      p_slug: `projects-test-${runId}`,
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
    // 1. Creation: admin and member can, readonly and an outsider cannot
    // -------------------------------------------------------------------

    const { data: adminProject, error: adminCreateError } = await owner.client
      .from("projects")
      .insert({ team_id: team.id, name: "Admin's Project", created_by: owner.userId })
      .select("id")
      .single();
    check(
      "an admin can create a project",
      !adminCreateError && Boolean(adminProject),
      adminCreateError?.message,
    );

    const { data: memberProject, error: memberCreateError } = await member.client
      .from("projects")
      .insert({ team_id: team.id, name: "Member's Project", created_by: member.userId })
      .select("id")
      .single();
    check(
      "a member can create a project",
      !memberCreateError && Boolean(memberProject),
      memberCreateError?.message,
    );

    const { error: readonlyCreateError } = await readonly.client
      .from("projects")
      .insert({ team_id: team.id, name: "Readonly's Project", created_by: readonly.userId })
      .select("id")
      .single();
    check(
      "a readonly member cannot create a project",
      Boolean(readonlyCreateError),
      readonlyCreateError ? undefined : "insert unexpectedly permitted",
    );

    const { error: outsiderCreateError } = await outsider.client
      .from("projects")
      .insert({ team_id: team.id, name: "Outsider's Project", created_by: outsider.userId })
      .select("id")
      .single();
    check(
      "a non-member cannot create a project",
      Boolean(outsiderCreateError),
      outsiderCreateError ? undefined : "insert unexpectedly permitted",
    );

    if (!adminProject || !memberProject) {
      throw new Error("Setup projects were not created — cannot continue.");
    }

    // -------------------------------------------------------------------
    // 2. Rename: admin-only, unchanged from Phase 11
    // -------------------------------------------------------------------

    const { data: renamed } = await owner.client
      .from("projects")
      .update({ name: "Renamed by Admin" })
      .eq("id", adminProject.id)
      .select("id");
    check("an admin can rename a project", renamed?.length === 1);

    const { data: renameAttempt } = await member.client
      .from("projects")
      .update({ name: "Hijacked" })
      .eq("id", adminProject.id)
      .select("id");
    check("a member cannot rename another project", (renameAttempt?.length ?? 0) === 0);

    const { data: readonlyRenameAttempt } = await readonly.client
      .from("projects")
      .update({ name: "Hijacked" })
      .eq("id", adminProject.id)
      .select("id");
    check(
      "a readonly member cannot rename a project",
      (readonlyRenameAttempt?.length ?? 0) === 0,
    );

    const { data: afterRenameAttempts } = await admin
      .from("projects")
      .select("name")
      .eq("id", adminProject.id)
      .single();
    check(
      "the project name is unchanged after non-admin attempts",
      afterRenameAttempts?.name === "Renamed by Admin",
      afterRenameAttempts?.name,
    );

    // -------------------------------------------------------------------
    // 3. Delete: admin-only, and cascades through environments/variables
    // -------------------------------------------------------------------

    // Fixture only — plants an environment and a variable under the
    // member-created project so the cascade actually has something to prove.
    const { data: env, error: envError } = await admin
      .from("environments")
      .insert({ project_id: memberProject.id, name: "development" })
      .select("id")
      .single();
    if (envError || !env) throw new Error(`Failed to seed environment: ${envError?.message}`);

    const { error: variableError } = await admin.from("variables").insert({
      environment_id: env.id,
      key: "TEST_VAR",
      encrypted_value: "n/a",
      encrypted_dek: "n/a",
      iv: "n/a",
      auth_tag: "n/a",
    });
    if (variableError) throw new Error(`Failed to seed variable: ${variableError.message}`);

    const { data: deleteAttempt } = await member.client
      .from("projects")
      .delete()
      .eq("id", memberProject.id)
      .select("id");
    check("a member cannot delete a project", (deleteAttempt?.length ?? 0) === 0);

    const { data: deleted } = await owner.client
      .from("projects")
      .delete()
      .eq("id", memberProject.id)
      .select("id");
    check("an admin can delete a project", deleted?.length === 1);

    const { count: survivingEnvironments } = await admin
      .from("environments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", memberProject.id);
    check("deleting a project cascades to its environments", survivingEnvironments === 0);

    const { count: survivingVariables } = await admin
      .from("variables")
      .select("id", { count: "exact", head: true })
      .eq("environment_id", env.id);
    check("deleting a project cascades to its variables", survivingVariables === 0);
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
  console.error("Projects test script crashed:", error);
  process.exit(1);
});
