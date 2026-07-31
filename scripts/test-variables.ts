/**
 * Phase 24 add-a-variable smoke test.
 *
 * Run: npm run test:variables
 *
 * Covers the two things this phase actually promises:
 *   1. The role rule ("readonly members cannot create") is enforced by
 *      Postgres, not just by which UI a readonly member happens to see —
 *      exercised the same way every other RLS test script in this project
 *      does, through each user's own signed-in anon-key client.
 *   2. The value that lands in the database is genuinely ciphertext, not
 *      the plaintext with extra steps — decrypts back to the original via
 *      lib/crypto/envelope.ts, and does not equal (or contain) the
 *      plaintext in its stored, encrypted form.
 *
 * As in the projects/environments test scripts: INSERT denials raise an
 * error outright; the duplicate-key case is a real unique_violation (23505),
 * not an RLS denial, so it's asserted on error.code specifically.
 *
 * Requires Phases 9, 11, 17, and 18's migrations to be applied.
 */

import { config as loadEnv } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

loadEnv({ path: ".env.local" });

const { createAdminClient } = await import("../lib/supabase/admin");
const { supabaseUrl, supabaseAnonKey } = await import("../lib/supabase/env");
const { createClient } = await import("@supabase/supabase-js");
const { encryptSecret, decryptSecret } = await import("../lib/crypto/envelope");

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
  const email = `variables-test-${label}-${runId}@example.com`;
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

function insertPayload(environmentId: string, key: string, plaintext: string, userId: string) {
  const encrypted = encryptSecret(plaintext);
  return {
    environment_id: environmentId,
    key,
    encrypted_value: encrypted.encryptedValue,
    encrypted_dek: encrypted.encryptedDek,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    created_by: userId,
    updated_by: userId,
  };
}

async function main() {
  const owner = await createTestUser("owner");
  const member = await createTestUser("member");
  const readonly = await createTestUser("readonly");
  const outsider = await createTestUser("outsider");

  try {
    const { data: team, error: teamError } = await owner.client.rpc("create_team", {
      p_name: "Variables Test",
      p_slug: `variables-test-${runId}`,
    });
    if (teamError || !team) throw new Error(`create_team failed: ${teamError?.message}`);
    createdTeamIds.add(team.id);

    const { error: seedError } = await admin.from("team_members").insert([
      { team_id: team.id, user_id: member.userId, role: "member" },
      { team_id: team.id, user_id: readonly.userId, role: "readonly" },
    ]);
    if (seedError) throw new Error(`Seeding members failed: ${seedError.message}`);

    const { data: project, error: projectError } = await owner.client.rpc("create_project", {
      p_team_id: team.id,
      p_name: "Variables Test Project",
    });
    if (projectError || !project) throw new Error(`create_project failed: ${projectError?.message}`);

    const { data: environments } = await admin
      .from("environments")
      .select("id, name")
      .eq("project_id", project.id)
      .order("sort_order", { ascending: true });
    const development = environments?.find((env) => env.name === "development");
    if (!development) throw new Error("Development environment was not created — cannot continue.");

    // -------------------------------------------------------------------
    // 1. Creation: admin and member can, readonly and an outsider cannot
    // -------------------------------------------------------------------

    const plaintext = "a genuinely secret value, 12345";

    const { data: adminVar, error: adminInsertError } = await owner.client
      .from("variables")
      .insert(insertPayload(development.id, "ADMIN_CREATED_SECRET", plaintext, owner.userId))
      .select("id")
      .single();
    check(
      "an admin can create a variable",
      !adminInsertError && Boolean(adminVar),
      adminInsertError?.message,
    );

    const { error: memberInsertError } = await member.client
      .from("variables")
      .insert(insertPayload(development.id, "MEMBER_CREATED_SECRET", plaintext, member.userId))
      .select("id")
      .single();
    check("a member can create a variable", !memberInsertError, memberInsertError?.message);

    const { error: readonlyInsertError } = await readonly.client
      .from("variables")
      .insert(insertPayload(development.id, "READONLY_ATTEMPT", plaintext, readonly.userId))
      .select("id")
      .single();
    check(
      "a readonly member cannot create a variable",
      Boolean(readonlyInsertError),
      readonlyInsertError ? undefined : "insert unexpectedly permitted",
    );

    const { error: outsiderInsertError } = await outsider.client
      .from("variables")
      .insert(insertPayload(development.id, "OUTSIDER_ATTEMPT", plaintext, outsider.userId))
      .select("id")
      .single();
    check(
      "a non-member cannot create a variable",
      Boolean(outsiderInsertError),
      outsiderInsertError ? undefined : "insert unexpectedly permitted",
    );

    // -------------------------------------------------------------------
    // 2. Duplicate keys within the same environment are rejected
    // -------------------------------------------------------------------

    const { error: duplicateError } = await owner.client
      .from("variables")
      .insert(insertPayload(development.id, "ADMIN_CREATED_SECRET", "a different value", owner.userId))
      .select("id")
      .single();
    check(
      "a duplicate key in the same environment is rejected",
      duplicateError?.code === "23505",
      duplicateError ? `code=${duplicateError.code}` : "duplicate insert unexpectedly permitted",
    );

    // -------------------------------------------------------------------
    // 3. The stored value is genuinely ciphertext, and round-trips
    // -------------------------------------------------------------------

    if (!adminVar) throw new Error("Setup variable was not created — cannot continue.");

    const { data: storedRow } = await admin
      .from("variables")
      .select("encrypted_value, encrypted_dek, iv, auth_tag")
      .eq("id", adminVar.id)
      .single();

    check(
      "the stored ciphertext does not equal the plaintext",
      storedRow?.encrypted_value !== plaintext,
      storedRow?.encrypted_value,
    );
    check(
      "the stored ciphertext does not even contain the plaintext",
      !(storedRow?.encrypted_value ?? "").includes(plaintext),
    );

    if (storedRow) {
      const decrypted = decryptSecret({
        encryptedValue: storedRow.encrypted_value,
        encryptedDek: storedRow.encrypted_dek,
        iv: storedRow.iv,
        authTag: storedRow.auth_tag,
      });
      check("the stored value decrypts back to the original plaintext", decrypted === plaintext);
    }
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
  console.error("Variables test script crashed:", error);
  process.exit(1);
});
