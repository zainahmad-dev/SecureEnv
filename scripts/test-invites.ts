/**
 * Phase 14 invite smoke test — proves the invitation lifecycle holds up in
 * Postgres, not just in the UI.
 *
 * Run: npm run test:invites
 *
 * The phase notes single out one path as the one that breaks: "the invited
 * person doesn't have an account yet", which is also the common case for a new
 * team. That's the first check here, end to end — an admin creates the invite
 * before the invitee exists at all, the account is created afterwards, and the
 * invite is redeemed by that brand-new user through their own signed-in client
 * (never the service-role client, which would bypass every policy under test).
 *
 * The rest cover the ways an invite must refuse to work:
 *   - the same link a second time (single use)
 *   - an expired link
 *   - a link redeemed by an account with a different email
 *   - a revoked link
 *   - a non-admin trying to create an invite at all
 *   - reading token_hash from an ordinary client (column privilege, not RLS)
 *
 * Everything it creates — one team, four throwaway auth users — is deleted in
 * a finally block, pass or fail.
 *
 * Requires the Phase 14 migrations to be applied, and INVITE_TOKEN_SECRET set
 * in .env.local.
 */

import { config as loadEnv } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Enums, TablesInsert } from "../types/database";

loadEnv({ path: ".env.local" });

// Deferred until after dotenv has loaded, same as scripts/test-rls.ts:
// lib/supabase/env.ts reads its variables at module-load time.
const { createAdminClient } = await import("../lib/supabase/admin");
const { supabaseUrl, supabaseAnonKey } = await import("../lib/supabase/env");
const { createInviteToken } = await import("../lib/invites/token");
const { createClient } = await import("@supabase/supabase-js");

const runId = Date.now();
const admin = createAdminClient();

const DAY_MS = 24 * 60 * 60 * 1000;

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
}

// Typed with the app's own Database types, so the checks below type-check
// against types/database.ts — a drift between that file and the migration
// shows up here rather than at runtime in a page.
type TestUser = {
  userId: string;
  email: string;
  client: SupabaseClient<Database>;
};

const createdUserIds: string[] = [];

async function createTestUser(label: string): Promise<TestUser> {
  const email = `invite-test-${label}-${runId}@example.com`;
  const password = crypto.randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${label}: ${error?.message}`);
  }
  createdUserIds.push(data.user.id);

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in test user ${label}: ${signInError.message}`);
  }

  return { userId: data.user.id, email, client };
}

/** The address a not-yet-created account will use, so an invite can precede it. */
function futureEmail(label: string) {
  return `invite-test-${label}-${runId}@example.com`;
}

type InviteOptions = { expiresAt?: Date; createdAt?: Date };

/**
 * Creates an invite the way the server action does — through the inviting
 * admin's own client, so the INSERT policy is exercised — and returns the
 * plaintext token, which exists only here and is never stored.
 */
async function createInvite(
  adminUser: TestUser,
  teamId: string,
  email: string,
  role: Enums<"team_role">,
  options: InviteOptions = {},
) {
  const { token, tokenHash } = createInviteToken();
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 7 * DAY_MS);

  const row: TablesInsert<"team_invites"> = {
    team_id: teamId,
    email,
    role,
    token_hash: tokenHash,
    invited_by: adminUser.userId,
    expires_at: expiresAt.toISOString(),
  };
  if (options.createdAt) row.created_at = options.createdAt.toISOString();

  const { error } = await adminUser.client.from("team_invites").insert(row);

  return { token, tokenHash, error };
}

async function main() {
  const teamAdmin = await createTestUser("admin");
  let teamId: string | undefined;

  try {
    const slug = `invite-test-${runId}`;
    const { data: team, error: teamError } = await teamAdmin.client.rpc("create_team", {
      p_name: "Invite Test Team",
      p_slug: slug,
    });
    if (teamError || !team) throw new Error(`create_team failed: ${teamError?.message}`);
    teamId = team.id;

    // ---------------------------------------------------------------------
    // 1. The invited person has no account yet (the path the notes flag)
    // ---------------------------------------------------------------------

    const inviteeEmail = futureEmail("newcomer");

    const { data: preInviteIsMember } = await teamAdmin.client.rpc(
      "team_has_member_with_email",
      { p_team_id: teamId, p_email: inviteeEmail },
    );
    check("an address with no account is not reported as a member", preInviteIsMember === false);

    const newcomerInvite = await createInvite(teamAdmin, teamId, inviteeEmail, "member");
    check(
      "an admin can invite an address that has no account yet",
      !newcomerInvite.error,
      newcomerInvite.error?.message,
    );

    // The account is created only now — after the invite exists.
    const newcomer = await createTestUser("newcomer");

    const { data: accepted, error: acceptError } = await newcomer.client.rpc(
      "accept_team_invite",
      { p_token_hash: newcomerInvite.tokenHash },
    );
    check(
      "a brand-new account can redeem the invite",
      !acceptError && accepted?.status === "accepted",
      acceptError?.message ?? `status=${accepted?.status}`,
    );
    check("accepting returns the team's slug to redirect to", accepted?.team_slug === slug);

    const { data: newMembership } = await newcomer.client
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", newcomer.userId)
      .maybeSingle();
    check(
      "the new member lands in team_members with the invited role",
      newMembership?.role === "member",
      `role=${newMembership?.role}`,
    );

    const { data: teamVisible } = await newcomer.client
      .from("teams")
      .select("id")
      .eq("id", teamId);
    check("the new member can now read the team through RLS", (teamVisible?.length ?? 0) === 1);

    // ---------------------------------------------------------------------
    // 2. Single use — the same link can't be redeemed twice
    // ---------------------------------------------------------------------

    const { data: replay } = await newcomer.client.rpc("accept_team_invite", {
      p_token_hash: newcomerInvite.tokenHash,
    });
    check("the same invite link fails the second time", replay?.status === "used");

    const { count: membershipCount } = await admin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("user_id", newcomer.userId);
    check("replaying the link did not create a duplicate membership", membershipCount === 1);

    const { data: nowIsMember } = await teamAdmin.client.rpc("team_has_member_with_email", {
      p_team_id: teamId,
      p_email: inviteeEmail,
    });
    check("an accepted invitee is reported as an existing member", nowIsMember === true);

    // ---------------------------------------------------------------------
    // 3. Expired invites
    // ---------------------------------------------------------------------

    const outsider = await createTestUser("outsider");

    const expiredInvite = await createInvite(
      teamAdmin,
      teamId,
      outsider.email,
      "member",
      { createdAt: new Date(Date.now() - 8 * DAY_MS), expiresAt: new Date(Date.now() - DAY_MS) },
    );
    check("setting up an expired invite succeeds", !expiredInvite.error, expiredInvite.error?.message);

    const { data: expiredPreview } = await outsider.client.rpc("get_invite_preview", {
      p_token_hash: expiredInvite.tokenHash,
    });
    check("an expired invite previews as expired", expiredPreview?.status === "expired");

    const { data: expiredAccept } = await outsider.client.rpc("accept_team_invite", {
      p_token_hash: expiredInvite.tokenHash,
    });
    check("an expired invite cannot be redeemed", expiredAccept?.status === "expired");

    const { count: outsiderCount } = await admin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("user_id", outsider.userId);
    check("a rejected acceptance creates no membership", outsiderCount === 0);

    // ---------------------------------------------------------------------
    // 4. A link redeemed by the wrong account
    // ---------------------------------------------------------------------

    const mismatchInvite = await createInvite(
      teamAdmin,
      teamId,
      futureEmail("somebody-else"),
      "member",
    );
    const { data: mismatchAccept } = await outsider.client.rpc("accept_team_invite", {
      p_token_hash: mismatchInvite.tokenHash,
    });
    check(
      "an invite can't be redeemed by a different email address",
      mismatchAccept?.status === "email_mismatch",
      `status=${mismatchAccept?.status}`,
    );

    // ---------------------------------------------------------------------
    // 5. Revoked invites
    // ---------------------------------------------------------------------

    // A fresh address, not outsider's: their expired invite from check 3 is
    // still pending, and the partial unique index allows only one live invite
    // per address per team.
    const revokedUser = await createTestUser("revoked");

    const revokedInvite = await createInvite(teamAdmin, teamId, revokedUser.email, "readonly");
    const { error: revokeError } = await teamAdmin.client
      .from("team_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("email", revokedUser.email)
      .is("accepted_at", null)
      .is("revoked_at", null);
    check("an admin can revoke a pending invite", !revokeError, revokeError?.message);

    const { data: revokedAccept } = await revokedUser.client.rpc("accept_team_invite", {
      p_token_hash: revokedInvite.tokenHash,
    });
    check("a revoked invite cannot be redeemed", revokedAccept?.status === "revoked");

    // ---------------------------------------------------------------------
    // 6. Only admins may invite
    // ---------------------------------------------------------------------

    const memberInvite = await createInvite(newcomer, teamId, futureEmail("nope"), "admin");
    check(
      "a non-admin member is rejected creating an invite",
      Boolean(memberInvite.error),
      memberInvite.error ? undefined : "insert unexpectedly succeeded",
    );

    const { data: memberProbe } = await newcomer.client.rpc("team_has_member_with_email", {
      p_team_id: teamId,
      p_email: inviteeEmail,
    });
    check(
      "a non-admin gets no answer out of the membership probe",
      memberProbe === false,
      `returned=${memberProbe}`,
    );

    // ---------------------------------------------------------------------
    // 7. token_hash is unreadable by ordinary clients (column privilege)
    // ---------------------------------------------------------------------

    // Nothing stops this being *written*; the database is what refuses to
    // answer it. That's the point — the guarantee is a column privilege, not a
    // convention the app is trusted to follow.
    const { error: hashReadError } = await teamAdmin.client
      .from("team_invites")
      .select("token_hash")
      .eq("team_id", teamId);
    check(
      "even a team admin cannot select token_hash",
      Boolean(hashReadError),
      hashReadError ? undefined : "select unexpectedly succeeded",
    );

    const { data: safeRead, error: safeReadError } = await teamAdmin.client
      .from("team_invites")
      .select("id, email, role, expires_at, accepted_at, revoked_at")
      .eq("team_id", teamId);
    check(
      "the columns the members screen needs are still readable",
      !safeReadError && (safeRead?.length ?? 0) > 0,
      safeReadError?.message,
    );

    // ---------------------------------------------------------------------
    // 8. An unknown token says nothing
    // ---------------------------------------------------------------------

    const { data: bogus } = await outsider.client.rpc("get_invite_preview", {
      p_token_hash: "0".repeat(64),
    });
    check("an unknown token previews as invalid", bogus?.status === "invalid");
  } finally {
    // Cascades to team_members and team_invites.
    if (teamId) await admin.from("teams").delete().eq("id", teamId);
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
  console.error("Invite test script crashed:", error);
  process.exit(1);
});
