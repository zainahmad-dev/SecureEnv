import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto/envelope";
import { DEMO_ACCOUNT_EMAIL, DEMO_TEAM_NAME, demoVariables } from "@/lib/demo/fixture";
import { runSecurityScan } from "@/lib/scanner/scan";
import { slugify } from "@/lib/teams/slug";
import type { Database } from "@/types/database";

/**
 * Puts the demo team back exactly as `npm run seed` left it.
 *
 * **Requires a service-role client.** Every statement here is something the
 * Phase 43 RESTRICTIVE policies exist to forbid — that's the point: reset is
 * an operator action, not a user one, and it deliberately runs outside the
 * boundary that makes the demo safe.
 *
 * Rewrites rather than recreates. Teams, projects, environments, and auth
 * users are all left in place, so their ids never change — which keeps any
 * URL someone bookmarked or put in a portfolio write-up working across
 * resets. Only the mutable contents are replaced.
 *
 * Not a transaction. PostgREST has no multi-statement transaction, so a
 * failure partway through leaves the demo half-reset. That's acceptable
 * precisely because this operation is idempotent and cheap: the fix for a
 * failed reset is to run it again, and the next scheduled run does that
 * anyway.
 */
export type DemoResetResult = {
  variablesWritten: number;
  auditRowsCleared: number;
  scansRecorded: number;
  projectsScanned: string[];
};

export async function resetDemoData(
  admin: SupabaseClient<Database>,
): Promise<DemoResetResult> {
  const teamSlug = slugify(DEMO_TEAM_NAME);

  const { data: team } = await admin
    .from("teams")
    .select("id")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (!team) {
    throw new Error(
      `No demo team "${DEMO_TEAM_NAME}" found. Run \`npm run seed\` before resetting.`,
    );
  }

  const { data: projects } = await admin
    .from("projects")
    .select("id, name, environments(id, name)")
    .eq("team_id", team.id)
    .order("name", { ascending: true });

  if (!projects || projects.length === 0) {
    throw new Error(`Demo team "${DEMO_TEAM_NAME}" has no projects. Run \`npm run seed\` first.`);
  }

  // The demo account's own id, used below to restore its profile. Resolved
  // through auth.users rather than assumed, since the seed creates it.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const demoUser = users?.users.find((user) => user.email === DEMO_ACCOUNT_EMAIL);

  // -------------------------------------------------------------------------
  // 1. Variables — deleted and rewritten, never updated in place.
  //
  // A fresh DEK and IV per value is the whole point of the encryption
  // design; updating a row would be the one path in this codebase that
  // could quietly start reusing one.
  // -------------------------------------------------------------------------

  const environmentIds = projects.flatMap((project) =>
    (project.environments ?? []).map((environment) => environment.id),
  );

  if (environmentIds.length > 0) {
    const { error } = await admin.from("variables").delete().in("environment_id", environmentIds);
    if (error) throw new Error(`Failed to clear demo variables: ${error.message}`);
  }

  const rows: Database["public"]["Tables"]["variables"]["Insert"][] = [];

  for (const project of projects) {
    const projectSlug = slugify(project.name);

    for (const environment of project.environments ?? []) {
      for (const variable of demoVariables(project.name, projectSlug, environment.name)) {
        const encrypted = encryptSecret(variable.value);

        rows.push({
          environment_id: environment.id,
          key: variable.key,
          encrypted_value: encrypted.encryptedValue,
          encrypted_dek: encrypted.encryptedDek,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          created_by: demoUser?.id ?? null,
          updated_by: demoUser?.id ?? null,
        });
      }
    }
  }

  if (rows.length > 0) {
    // One statement, so this is atomic on its own even without a
    // surrounding transaction — the demo never sits in a state where only
    // some environments have variables.
    const { error } = await admin.from("variables").insert(rows);
    if (error) throw new Error(`Failed to write demo variables: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // 2. The audit ledger.
  //
  // This is the row set demo visitors actually add to — audit_logs is the
  // one table the Phase 43 policies deliberately leave writable, so that a
  // reveal in the demo shows up in the activity feed the way it would for a
  // real user. Clearing it here is what keeps that exemption bounded.
  // -------------------------------------------------------------------------

  const { count: auditRowsCleared } = await admin
    .from("audit_logs")
    .delete({ count: "exact" })
    .eq("team_id", team.id);

  // -------------------------------------------------------------------------
  // 3. Scan history, then one fresh scan per project.
  //
  // Without this the scanner page — the demo's best screen — would show
  // "Not yet scanned" to every visitor, because the demo account is
  // readonly and so can't press Run scan itself. Seeding a real scan result
  // is what makes that page worth looking at.
  // -------------------------------------------------------------------------

  const { error: scanDeleteError } = await admin
    .from("security_scans")
    .delete()
    .in(
      "project_id",
      projects.map((project) => project.id),
    );
  if (scanDeleteError) {
    throw new Error(`Failed to clear demo scan history: ${scanDeleteError.message}`);
  }

  let scansRecorded = 0;
  const projectsScanned: string[] = [];

  for (const project of projects) {
    // useAi stays on: the AI layer degrades to rules-only by design if Groq
    // is unreachable or unconfigured (lib/scanner/scan.ts), so this is never
    // a reason for a reset to fail — it just produces a slightly thinner
    // set of findings.
    const result = await runSecurityScan({ supabase: admin, projectId: project.id });

    if (result) {
      scansRecorded += result.environments.filter((env) => env.score !== null).length;
      projectsScanned.push(project.name);
    }
  }

  // -------------------------------------------------------------------------
  // 4. The demo account's own profile.
  //
  // Belt and braces. The Phase 43 policies already block a demo visitor
  // from writing here, and Phase 16's column grants already stop anyone
  // from touching is_demo — but this account is shared and public, so
  // anything cosmetic that did somehow get changed would be seen by every
  // later visitor until the next reset.
  // -------------------------------------------------------------------------

  if (demoUser) {
    await admin
      .from("profiles")
      .update({ display_name: null, avatar_initials: "DE", is_demo: true })
      .eq("id", demoUser.id);
  }

  return {
    variablesWritten: rows.length,
    auditRowsCleared: auditRowsCleared ?? 0,
    scansRecorded,
    projectsScanned,
  };
}
