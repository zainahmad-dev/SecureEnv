/**
 * Phase 12 seed script — populates a realistic demo team so every later
 * phase (variables UI, audit log, scanner) has real, correctly-encrypted
 * data to work against and demo.
 *
 * Run: npm run seed
 *
 * Idempotent — safe to run twice. Team/users/projects/environments/
 * variables are each looked up before being created; nothing here ever
 * deletes or overwrites what's already there. Unlike scripts/test-*.ts, this
 * script does NOT clean up after itself — the entire point is to leave real
 * data behind to explore. To put an already-seeded demo *back* to this
 * state, use `npm run demo:reset` (Phase 43), which rewrites contents
 * without recreating the team, projects, or accounts.
 *
 * Logins (fixed on purpose, not secrets — this is throwaway demo data, not
 * anything the app protects). See lib/demo/fixture.ts for the list; the
 * fourth account is the public one behind the "Explore the demo" button,
 * flagged `is_demo` so the Phase 43 RESTRICTIVE policies make it read-only.
 *
 * Plants three problems for the Phase 39-41 scanner to find, all inside the
 * "Client Dashboard" project so a single project tells the whole demo story.
 * Those three, and the fixture they live in, moved to lib/demo/fixture.ts in
 * Phase 43 so the reset routine builds byte-identical data from one source
 * rather than a second copy that could drift out of agreement with
 * scripts/test-scanner.ts's assertions.
 */

import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

loadEnv({ path: ".env.local" });

const { createAdminClient } = await import("../lib/supabase/admin");
const { supabaseUrl, supabaseAnonKey } = await import("../lib/supabase/env");
const { encryptSecret } = await import("../lib/crypto/envelope");
const { slugify } = await import("../lib/teams/slug");
const {
  DEMO_PASSWORD,
  DEMO_PROJECT_NAMES,
  DEMO_TEAM_NAME,
  DEMO_USERS,
  demoVariables,
} = await import("../lib/demo/fixture");

const admin = createAdminClient();

const TEAM_NAME = DEMO_TEAM_NAME;
const PROJECT_NAMES = DEMO_PROJECT_NAMES;
const SEED_USERS = DEMO_USERS;

type Role = Database["public"]["Enums"]["team_role"];

async function findOrCreateUser(email: string): Promise<string> {
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Failed to list users: ${listError.message}`);

  const found = existing.users.find((user) => user.email === email);
  if (found) return found.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create user ${email}: ${error?.message}`);
  }
  return data.user.id;
}

async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  return client;
}

/** Goes through create_team() (via the admin's own signed-in client) so attribution and the bootstrap membership work exactly as they would for a real user. */
async function ensureTeam(adminClient: SupabaseClient<Database>): Promise<string> {
  const slug = slugify(TEAM_NAME);

  const { data: existing } = await admin.from("teams").select("id").eq("slug", slug).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await adminClient.rpc("create_team", { p_name: TEAM_NAME, p_slug: slug });
  if (error || !data) throw new Error(`Failed to create team: ${error?.message}`);
  return data.id;
}

async function ensureMembership(teamId: string, userId: string, role: Role): Promise<void> {
  const { data: existing } = await admin
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  // Fixture-style direct insert (service-role, bypassing RLS) — the admin's
  // own membership already exists from create_team's bootstrap clause; this
  // only ever actually inserts for the other two seed users.
  const { error } = await admin.from("team_members").insert({ team_id: teamId, user_id: userId, role });
  if (error) throw new Error(`Failed to add membership for ${userId}: ${error.message}`);
}

/** Goes through create_project() (Phase 18) so its three default environments are seeded atomically, exactly as a real project creation would. */
async function ensureProject(adminClient: SupabaseClient<Database>, teamId: string, name: string): Promise<string> {
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("team_id", teamId)
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await adminClient.rpc("create_project", { p_team_id: teamId, p_name: name });
  if (error || !data) throw new Error(`Failed to create project ${name}: ${error?.message}`);
  return data.id;
}

async function getEnvironments(projectId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await admin
    .from("environments")
    .select("id, name")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error || !data) throw new Error(`Failed to fetch environments: ${error?.message}`);
  return data;
}

async function ensureVariable(
  environmentId: string,
  key: string,
  value: string,
  userId: string,
): Promise<boolean> {
  const { data: existing } = await admin
    .from("variables")
    .select("id")
    .eq("environment_id", environmentId)
    .eq("key", key)
    .maybeSingle();
  if (existing) return false;

  // The one non-negotiable part of this whole script: values are written
  // through the real encryption path, never inserted as plaintext.
  const encrypted = encryptSecret(value);

  const { error } = await admin.from("variables").insert({
    environment_id: environmentId,
    key,
    encrypted_value: encrypted.encryptedValue,
    encrypted_dek: encrypted.encryptedDek,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    created_by: userId,
    updated_by: userId,
  });
  if (error) throw new Error(`Failed to insert variable ${key}: ${error.message}`);
  return true;
}

async function main() {
  console.log(`Seeding "${TEAM_NAME}"...`);

  const userIds = new Map<string, string>();
  for (const user of SEED_USERS) {
    userIds.set(user.email, await findOrCreateUser(user.email));
  }
  console.log(`  Users ready: ${SEED_USERS.map((u) => u.label).join(", ")}`);

  const adminSeedUser = SEED_USERS[0];
  const adminClient = await signInAs(adminSeedUser.email);
  const adminUserId = userIds.get(adminSeedUser.email)!;

  const teamId = await ensureTeam(adminClient);
  console.log(`  Team ready: ${TEAM_NAME}`);

  for (const user of SEED_USERS) {
    await ensureMembership(teamId, userIds.get(user.email)!, user.role);
  }
  console.log("  Memberships ready.");

  // Phase 43. Set through the service-role client because it has to be:
  // `is_demo` is deliberately outside the column grant the `authenticated`
  // role holds on profiles, so no signed-in client — including this
  // account itself — can set or clear it.
  for (const user of SEED_USERS.filter((candidate) => candidate.isDemo)) {
    const { error } = await admin
      .from("profiles")
      .update({ is_demo: true })
      .eq("id", userIds.get(user.email)!);
    if (error) throw new Error(`Failed to flag the demo account: ${error.message}`);
    console.log(`  Demo account flagged read-only: ${user.email}`);
  }

  let createdVariables = 0;
  let skippedVariables = 0;

  for (const projectName of PROJECT_NAMES) {
    const projectSlug = slugify(projectName);
    const projectId = await ensureProject(adminClient, teamId, projectName);
    const environments = await getEnvironments(projectId);

    for (const env of environments) {
      const variables = demoVariables(projectName, projectSlug, env.name);

      for (const variable of variables) {
        const created = await ensureVariable(env.id, variable.key, variable.value, adminUserId);
        if (created) createdVariables += 1;
        else skippedVariables += 1;
      }
    }

    console.log(`  Project ready: ${projectName} (development/staging/production)`);
  }

  console.log(
    `\nDone. ${createdVariables} variable(s) created, ${skippedVariables} already present and left untouched.`,
  );
  console.log("\nLog in and explore:");
  for (const user of SEED_USERS) {
    console.log(`  ${user.label}: ${user.email}`);
  }
  console.log(`  password (all accounts): ${DEMO_PASSWORD}`);
  console.log(
    "\nThe public demo account is also reachable with one click from /login — no password needed.",
  );
}

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
