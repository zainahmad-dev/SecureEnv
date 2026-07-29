/**
 * Phase 16 profiles smoke test — the last_team_id column and the column-level
 * grant added alongside it (supabase/migrations/20260729220000_last_team_
 * preference.sql).
 *
 * Run: npm run test:profiles
 *
 * Two things under test, both through a signed-in user's own anon-key client:
 *
 *   1. The columns a user is meant to change (display_name, avatar_initials,
 *      last_team_id) can actually be updated on their own row.
 *   2. created_at cannot — closing the gap Phase 7's original self-update
 *      policy left open (it had no column restriction at all), which this
 *      migration's grant/revoke pair is what actually closes, not the RLS
 *      policy itself.
 *
 * Also re-checks, as a regression, that Phase 14's "self or teammate" SELECT
 * policy and the still-self-only UPDATE policy are both intact: a user can
 * read a teammate's profile but not write to it, and cannot read or write a
 * total stranger's.
 *
 * Requires the Phase 16 migration to be applied.
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
  const email = `profiles-test-${label}-${runId}@example.com`;
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
  const teammate = await createTestUser("teammate");
  const stranger = await createTestUser("stranger");

  try {
    const { data: team, error: teamError } = await owner.client.rpc("create_team", {
      p_name: "Profiles Test Team",
      p_slug: `profiles-test-${runId}`,
    });
    if (teamError || !team) throw new Error(`create_team failed: ${teamError?.message}`);
    createdTeamIds.add(team.id);

    // create_team() sets last_team_id itself in the surrounding server
    // action, not the SQL function — set it here directly since this script
    // exercises the database, not lib/teams/actions.ts.
    check(
      "the creator can set their own last_team_id",
      !(
        await owner.client
          .from("profiles")
          .update({ last_team_id: team.id })
          .eq("id", owner.userId)
      ).error,
    );

    // Fixture only — service-role insert, bypassing RLS deliberately.
    const { error: seedError } = await admin
      .from("team_members")
      .insert({ team_id: team.id, user_id: teammate.userId, role: "member" });
    if (seedError) throw new Error(`Seeding teammate failed: ${seedError.message}`);

    // -------------------------------------------------------------------
    // 1. Columns a user should be able to change on their own row
    // -------------------------------------------------------------------

    const { error: nameError } = await owner.client
      .from("profiles")
      .update({ display_name: "Test Owner" })
      .eq("id", owner.userId);
    check("a user can update their own display_name", !nameError, nameError?.message);

    const { error: initialsError } = await owner.client
      .from("profiles")
      .update({ avatar_initials: "TO" })
      .eq("id", owner.userId);
    check("a user can update their own avatar_initials", !initialsError, initialsError?.message);

    const { data: afterUpdate } = await admin
      .from("profiles")
      .select("display_name, avatar_initials, last_team_id")
      .eq("id", owner.userId)
      .single();
    check(
      "the allowed updates actually landed",
      afterUpdate?.display_name === "Test Owner" &&
        afterUpdate?.avatar_initials === "TO" &&
        afterUpdate?.last_team_id === team.id,
      JSON.stringify(afterUpdate),
    );

    // -------------------------------------------------------------------
    // 2. created_at is not — the column grant, not just the RLS policy
    // -------------------------------------------------------------------

    const originalCreatedAt = (
      await admin.from("profiles").select("created_at").eq("id", owner.userId).single()
    ).data?.created_at;

    const { error: createdAtError } = await owner.client
      .from("profiles")
      .update({ created_at: new Date(0).toISOString() })
      .eq("id", owner.userId);
    check(
      "a user cannot update their own created_at",
      Boolean(createdAtError),
      createdAtError ? undefined : "update unexpectedly permitted",
    );

    const { data: unchangedRow } = await admin
      .from("profiles")
      .select("created_at")
      .eq("id", owner.userId)
      .single();
    check(
      "created_at is unchanged after the rejected attempt",
      unchangedRow?.created_at === originalCreatedAt,
    );

    // -------------------------------------------------------------------
    // 3. Regression: teammate visibility (Phase 14) and self-only writes
    // -------------------------------------------------------------------

    const { data: teammateView, error: teammateReadError } = await teammate.client
      .from("profiles")
      .select("id, display_name")
      .eq("id", owner.userId)
      .maybeSingle();
    check(
      "a teammate can still read this user's profile",
      !teammateReadError && teammateView?.id === owner.userId,
      teammateReadError?.message,
    );

    const { data: teammateWriteAttempt } = await teammate.client
      .from("profiles")
      .update({ display_name: "Hijacked" })
      .eq("id", owner.userId)
      .select("id");
    check(
      "a teammate cannot write to this user's profile",
      (teammateWriteAttempt?.length ?? 0) === 0,
    );

    const { data: strangerView } = await stranger.client
      .from("profiles")
      .select("id")
      .eq("id", owner.userId);
    check(
      "a stranger (no shared team) cannot read this user's profile",
      (strangerView?.length ?? 0) === 0,
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
  console.error("Profiles test script crashed:", error);
  process.exit(1);
});
