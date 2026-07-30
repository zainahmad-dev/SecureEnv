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
 * data behind to explore.
 *
 * Demo login (fixed on purpose, not a secret — this is throwaway local
 * demo data, not anything the app protects):
 *   admin:    jordan@northstaragency.example
 *   member:   casey@northstaragency.example
 *   readonly: riley@northstaragency.example
 *   password (all three): NorthstarDemo123!
 *
 * Plants three problems for the Phase 39-41 scanner to find, all inside the
 * "Client Dashboard" project so a single project tells the whole demo story:
 *   - a live-looking Stripe key in development (non-production)
 *   - a too-short secret (JWT_SECRET, under 16 characters)
 *   - a value reused across two environments (NEXTAUTH_SECRET, staging = production)
 *
 * Every fake value below is deliberately shaped to NOT match a real secret-
 * scanning pattern (extra words/underscores breaking the base62-only
 * character class real provider keys use) — GitHub's push protection
 * flagged an earlier, too-realistic-looking fixture in this exact project
 * (lib/crypto/envelope.test.ts), so this script is written to never repeat
 * that even though every value here is already fake.
 */

import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

loadEnv({ path: ".env.local" });

const { createAdminClient } = await import("../lib/supabase/admin");
const { supabaseUrl, supabaseAnonKey } = await import("../lib/supabase/env");
const { encryptSecret } = await import("../lib/crypto/envelope");
const { slugify } = await import("../lib/teams/slug");

const admin = createAdminClient();

const DEMO_PASSWORD = "NorthstarDemo123!";
const TEAM_NAME = "Northstar Agency";
const PROJECT_NAMES = ["Client Dashboard", "Marketing Website", "Support Portal"];

type Role = Database["public"]["Enums"]["team_role"];

type SeedUser = { email: string; label: string; role: Role };

const SEED_USERS: SeedUser[] = [
  { email: "jordan@northstaragency.example", label: "Jordan (admin)", role: "admin" },
  { email: "casey@northstaragency.example", label: "Casey (member)", role: "member" },
  { email: "riley@northstaragency.example", label: "Riley (readonly)", role: "readonly" },
];

type VariableSeed = { key: string; value: string };

/**
 * Seven realistic key names per environment, every value parameterised by
 * project + environment so nothing collides by accident — the one
 * deliberate duplicate (below) is the only intentional exception.
 */
function baseVariables(projectSlug: string, envName: string): VariableSeed[] {
  const stripePrefix = envName === "production" ? "sk_live_" : "sk_test_";

  return [
    {
      key: "DATABASE_URL",
      value: `postgresql://demo_user:demo_password@localhost:5432/${projectSlug}_${envName}`,
    },
    {
      key: "STRIPE_SECRET_KEY",
      value: `${stripePrefix}FAKE_${projectSlug}_${envName}_DO_NOT_USE`,
    },
    {
      key: "NEXTAUTH_SECRET",
      value: `demo-nextauth-secret-${projectSlug}-${envName}-not-real`,
    },
    {
      key: "RESEND_API_KEY",
      value: `re_FAKE_${projectSlug}_${envName}_DO_NOT_USE`,
    },
    {
      key: "NEXT_PUBLIC_APP_URL",
      value: `https://${projectSlug}-${envName}.northstaragency.example`,
    },
    {
      key: "REDIS_URL",
      value: `redis://demo:demo@localhost:6379/${projectSlug}-${envName}`,
    },
    {
      key: "JWT_SECRET",
      value: `demo-jwt-secret-${projectSlug}-${envName}-not-real`,
    },
  ];
}

/** The three planted problems, applied only to "Client Dashboard". */
function applyPlantedProblems(projectName: string, envName: string, vars: VariableSeed[]): VariableSeed[] {
  if (projectName !== "Client Dashboard") return vars;

  const REUSED_SECRET = "reused-fake-secret-across-envs-warning";

  return vars.map((variable) => {
    if (envName === "development" && variable.key === "STRIPE_SECRET_KEY") {
      // Planted: a live-looking key in a non-production environment.
      return { ...variable, value: "sk_live_FAKE_client-dashboard_development_DO_NOT_USE" };
    }
    if (envName === "development" && variable.key === "JWT_SECRET") {
      // Planted: shorter than 16 characters.
      return { ...variable, value: "short12" };
    }
    if ((envName === "staging" || envName === "production") && variable.key === "NEXTAUTH_SECRET") {
      // Planted: identical value reused across two environments.
      return { ...variable, value: REUSED_SECRET };
    }
    return variable;
  });
}

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

  let createdVariables = 0;
  let skippedVariables = 0;

  for (const projectName of PROJECT_NAMES) {
    const projectSlug = slugify(projectName);
    const projectId = await ensureProject(adminClient, teamId, projectName);
    const environments = await getEnvironments(projectId);

    for (const env of environments) {
      const variables = applyPlantedProblems(projectName, env.name, baseVariables(projectSlug, env.name));

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
  console.log(`  password (all three): ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
