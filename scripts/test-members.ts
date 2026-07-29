/**
 * Phase 15 members/roles smoke test — proves the rules on the members screen
 * are enforced by Postgres, not by the React that renders it.
 *
 * Run: npm run test:members
 *
 * The phase's requirement is "enforce every one of these rules server-side,
 * not only in the UI", so every check here goes through a signed-in user's own
 * anon-key client — the same path the browser takes. The service-role client
 * appears only to build fixtures and to clean up.
 *
 * Note on how a denied write looks: RLS doesn't raise on an UPDATE or DELETE
 * whose USING clause excludes the row, it just affects zero rows. So the
 * checks below chain .select() and assert on the number of rows that came
 * back — an error would be the wrong thing to wait for, and waiting for one is
 * how a test like this passes while the policy does nothing.
 *
 * Two of these are regression tests for the cascade problem the last-admin
 * trigger creates if it's written naively: deleting a team, and deleting the
 * user account of a team's only admin, must both still work.
 *
 * Requires the Phase 15 migration to be applied.
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
  const email = `members-test-${label}-${runId}@example.com`;
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

async function createTeamFor(user: TestUser, label: string) {
  const { data, error } = await user.client.rpc("create_team", {
    p_name: `Members Test ${label}`,
    p_slug: `members-test-${label}-${runId}`,
  });
  if (error || !data) throw new Error(`create_team failed for ${label}: ${error?.message}`);
  createdTeamIds.add(data.id);

  return data;
}

async function roleOf(teamId: string, userId: string) {
  const { data } = await admin
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  return data?.role ?? null;
}

async function main() {
  const owner = await createTestUser("owner");
  const member = await createTestUser("member");
  const readonly = await createTestUser("readonly");
  const outsider = await createTestUser("outsider");

  try {
    const team = await createTeamFor(owner, "core");

    // Fixture only — service-role insert, bypassing RLS deliberately.
    const { error: seedError } = await admin.from("team_members").insert([
      { team_id: team.id, user_id: member.userId, role: "member" },
      { team_id: team.id, user_id: readonly.userId, role: "readonly" },
    ]);
    if (seedError) throw new Error(`Seeding members failed: ${seedError.message}`);

    const { data: memberRow } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", team.id)
      .eq("user_id", member.userId)
      .single();
    const memberRowId = memberRow?.id;
    if (!memberRowId) throw new Error("Could not resolve the member's membership row");

    // -------------------------------------------------------------------
    // 1. Reading the list
    // -------------------------------------------------------------------

    const { data: listForOwner, error: listError } = await owner.client.rpc("get_team_members", {
      p_team_id: team.id,
    });
    check(
      "an admin can read the members list",
      !listError && listForOwner?.length === 3,
      listError?.message ?? `rows=${listForOwner?.length}`,
    );

    const ownerEntry = listForOwner?.find((row) => row.user_id === owner.userId);
    check("the list carries each member's email", ownerEntry?.email === owner.email);
    check("the list carries avatar initials", Boolean(ownerEntry?.avatar_initials));
    check("the list carries a joined date", Boolean(ownerEntry?.joined_at));

    const { data: listForReadonly } = await readonly.client.rpc("get_team_members", {
      p_team_id: team.id,
    });
    check(
      "a readonly member can also read the list",
      listForReadonly?.length === 3,
      `rows=${listForReadonly?.length}`,
    );

    const { data: listForOutsider } = await outsider.client.rpc("get_team_members", {
      p_team_id: team.id,
    });
    check(
      "a non-member gets nothing from the members list",
      (listForOutsider?.length ?? 0) === 0,
      `rows=${listForOutsider?.length}`,
    );

    // -------------------------------------------------------------------
    // 2. An admin can change a role
    // -------------------------------------------------------------------

    const { data: promoted } = await owner.client
      .from("team_members")
      .update({ role: "readonly" })
      .eq("id", memberRowId)
      .select("id");
    check("an admin can change a member's role", promoted?.length === 1);
    check(
      "the role change actually landed",
      (await roleOf(team.id, member.userId)) === "readonly",
    );

    await owner.client.from("team_members").update({ role: "member" }).eq("id", memberRowId);

    // -------------------------------------------------------------------
    // 3. A non-admin cannot
    // -------------------------------------------------------------------

    const { data: memberAttempt } = await member.client
      .from("team_members")
      .update({ role: "admin" })
      .eq("team_id", team.id)
      .eq("user_id", readonly.userId)
      .select("id");
    check("a non-admin's role change affects zero rows", (memberAttempt?.length ?? 0) === 0);
    check(
      "the target's role is unchanged after a non-admin's attempt",
      (await roleOf(team.id, readonly.userId)) === "readonly",
    );

    const { data: memberDeleteAttempt } = await member.client
      .from("team_members")
      .delete()
      .eq("team_id", team.id)
      .eq("user_id", readonly.userId)
      .select("id");
    check("a non-admin's removal affects zero rows", (memberDeleteAttempt?.length ?? 0) === 0);
    check(
      "the target is still a member after a non-admin's attempt",
      (await roleOf(team.id, readonly.userId)) === "readonly",
    );

    // A readonly member is the strictest case — check it separately rather
    // than assuming it behaves like 'member'.
    const { data: readonlyAttempt } = await readonly.client
      .from("team_members")
      .update({ role: "admin" })
      .eq("team_id", team.id)
      .eq("user_id", readonly.userId)
      .select("id");
    check("a readonly member can't promote themselves", (readonlyAttempt?.length ?? 0) === 0);

    // -------------------------------------------------------------------
    // 4. role is the only column an admin may update
    // -------------------------------------------------------------------

    const { error: columnError } = await owner.client
      .from("team_members")
      .update({ user_id: outsider.userId })
      .eq("id", memberRowId)
      .select("id");
    check(
      "an admin cannot repoint a membership at another user",
      Boolean(columnError),
      columnError ? undefined : "update unexpectedly permitted",
    );

    // -------------------------------------------------------------------
    // 5. The last admin can be neither demoted nor removed
    // -------------------------------------------------------------------

    const { data: ownerRow } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", team.id)
      .eq("user_id", owner.userId)
      .single();
    const ownerRowId = ownerRow?.id;
    if (!ownerRowId) throw new Error("Could not resolve the owner's membership row");

    const { error: demoteError } = await owner.client
      .from("team_members")
      .update({ role: "member" })
      .eq("id", ownerRowId)
      .select("id");
    check(
      "the only admin cannot demote themselves",
      demoteError?.code === "P0001",
      demoteError ? `code=${demoteError.code}` : "update unexpectedly permitted",
    );
    check("the only admin is still an admin", (await roleOf(team.id, owner.userId)) === "admin");

    const { error: selfRemoveError } = await owner.client
      .from("team_members")
      .delete()
      .eq("id", ownerRowId)
      .select("id");
    check(
      "the only admin cannot remove themselves",
      selfRemoveError?.code === "P0001",
      selfRemoveError ? `code=${selfRemoveError.code}` : "delete unexpectedly permitted",
    );
    check("the only admin is still a member", (await roleOf(team.id, owner.userId)) === "admin");

    // -------------------------------------------------------------------
    // 6. …but a second admin unblocks it
    // -------------------------------------------------------------------

    const { data: secondAdmin } = await owner.client
      .from("team_members")
      .update({ role: "admin" })
      .eq("id", memberRowId)
      .select("id");
    check("an admin can promote someone to admin", secondAdmin?.length === 1);

    const { data: nowDemoted, error: nowDemoteError } = await owner.client
      .from("team_members")
      .update({ role: "member" })
      .eq("id", ownerRowId)
      .select("id");
    check(
      "with a second admin in place, the first can be demoted",
      !nowDemoteError && nowDemoted?.length === 1,
      nowDemoteError?.message,
    );
    check(
      "the demotion landed",
      (await roleOf(team.id, owner.userId)) === "member",
    );

    // -------------------------------------------------------------------
    // 7. Cascades still work (regression — the trigger must not block them)
    // -------------------------------------------------------------------

    const solo = await createTestUser("solo");
    const soloTeam = await createTeamFor(solo, "solo");

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(solo.userId);
    check(
      "deleting the account of a team's only admin still works",
      !deleteUserError,
      deleteUserError?.message,
    );
    if (!deleteUserError) createdUserIds.delete(solo.userId);

    const { count: soloMembers } = await admin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", soloTeam.id);
    check("their membership row went with the account", soloMembers === 0);

    const { error: deleteTeamError } = await admin.from("teams").delete().eq("id", team.id);
    check(
      "deleting a team still cascades through its admin's membership",
      !deleteTeamError,
      deleteTeamError?.message,
    );
    if (!deleteTeamError) createdTeamIds.delete(team.id);

    const { count: survivingMembers } = await admin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", team.id);
    check("no membership rows survived the team deletion", survivingMembers === 0);
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
  console.error("Members test script crashed:", error);
  process.exit(1);
});
