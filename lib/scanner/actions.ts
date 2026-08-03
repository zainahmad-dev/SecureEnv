"use server";

import { revalidatePath } from "next/cache";
import { AIUserRateLimitedError, enforceAiRateLimit } from "@/lib/ai/rate-limit";
import { logAudit } from "@/lib/audit";
import { requireTeamAccess } from "@/lib/auth/team-access";
import type { AiScanStatus } from "@/lib/scanner/scan";
import { runSecurityScan } from "@/lib/scanner/scan";
import { createClient } from "@/lib/supabase/server";

const SCAN_DENIED = "Only team admins and members can run a security scan.";

export type RunScanState =
  | { status: "idle" }
  | { status: "ok"; aiStatus: AiScanStatus; aiDetail?: string }
  | { status: "error"; error: string };

/**
 * Runs a scan for one project and persists the result — the three things
 * Phase 40 deliberately left to this phase, following
 * lib/ai/generator/actions.ts's precedent that the server action owns
 * authorization, rate limiting, and audit logging, not the library
 * function underneath it.
 *
 * `member` matches the threshold for every other write on a project's
 * variables — a readonly member can already view whatever the last scan
 * found (Phase 11's own SELECT policy on security_scans only requires
 * `readonly`), but triggering a new one is a write, same as adding a
 * variable.
 */
export async function runScan(_prevState: RunScanState, formData: FormData): Promise<RunScanState> {
  const teamId = String(formData.get("teamId") ?? "");
  const teamSlug = String(formData.get("teamSlug") ?? "");
  const projectId = String(formData.get("projectId") ?? "");

  if (!teamId || !teamSlug || !projectId) {
    return { status: "error", error: "Something went wrong. Reload the page and try again." };
  }

  const access = await requireTeamAccess(teamId, "member", SCAN_DENIED);
  if (!access.ok) return { status: "error", error: access.error };

  // The rate limit guards only the AI call, not the scan itself — a user who
  // has hit their hourly AI quota still gets the deterministic rules, which
  // is the same "the AI layer degrades, it doesn't fail" philosophy
  // lib/scanner/scan.ts already applies when Groq itself is unavailable.
  // One enforceAiRateLimit() call per click either way, so a user can't
  // dodge the quota by triggering scans that then fail past it.
  let useAi = true;
  try {
    await enforceAiRateLimit();
  } catch (error) {
    if (error instanceof AIUserRateLimitedError) {
      useAi = false;
    } else {
      throw error;
    }
  }

  const supabase = await createClient();

  let result;
  try {
    result = await runSecurityScan({ supabase, projectId, useAi });
  } catch (error) {
    // runSecurityScan/persistScanResults deliberately throw on a failed
    // write — "the row IS the product, not a record of it" — but that
    // contract is for the library layer. At this edge, a thrown error
    // would otherwise surface as a generic framework crash instead of the
    // "never a dead spinner" message every other action in this app gives.
    console.error(
      `Security scan failed for project ${projectId}:`,
      error instanceof Error ? error.message : error,
    );
    return { status: "error", error: "Could not complete the scan. Try again." };
  }

  if (!result) {
    return { status: "error", error: "That project no longer exists." };
  }

  // A scan reads and decrypts every variable in the project — the
  // heaviest single read this app performs — so it earns its own audit
  // entry the same way a variable reveal does, aggregated as one row
  // rather than one per variable (same reasoning as the AI generator's
  // batch-save entry in lib/variables/actions.ts). No environmentId: the
  // action spans every environment in the project, not one.
  await logAudit({
    teamId,
    userId: access.userId,
    action: "read",
    targetType: "project",
    targetId: projectId,
    metadata: {
      scan: true,
      environmentsScored: result.environments.filter((environment) => environment.score !== null)
        .length,
      aiStatus: result.aiStatus,
    },
  });

  revalidatePath(`/teams/${teamSlug}/projects/${projectId}/scanner`);

  return { status: "ok", aiStatus: result.aiStatus, aiDetail: result.aiDetail };
}
