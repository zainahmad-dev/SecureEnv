/**
 * Phase 43 — resets the public demo back to its seeded state, on demand.
 *
 * Run: npm run demo:reset
 *
 * The scheduled counterpart is POST /api/demo/reset, which runs the exact
 * same lib/demo/reset.ts routine from a Vercel Cron trigger. This script is
 * the "on demand" half of the phase's "on a schedule or on demand" — useful
 * locally, and useful in production when someone has just left the demo in
 * a state you'd rather a recruiter didn't open five minutes later.
 *
 * Requires `npm run seed` to have been run at least once: reset rewrites the
 * demo team's contents, it does not create the team, its projects, or its
 * accounts.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const { createAdminClient } = await import("../lib/supabase/admin");
const { resetDemoData } = await import("../lib/demo/reset");
const { DEMO_TEAM_NAME } = await import("../lib/demo/fixture");

async function main() {
  console.log(`Resetting the "${DEMO_TEAM_NAME}" demo...\n`);

  const result = await resetDemoData(createAdminClient());

  console.log(`  Variables rewritten:   ${result.variablesWritten}`);
  console.log(`  Audit rows cleared:    ${result.auditRowsCleared}`);
  console.log(`  Scans recorded:        ${result.scansRecorded}`);
  console.log(`  Projects scanned:      ${result.projectsScanned.join(", ") || "none"}`);
  console.log("\nDemo reset.");
}

main().catch((error) => {
  console.error("Demo reset failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
