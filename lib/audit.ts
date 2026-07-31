import { sanitizeMetadata } from "@/lib/audit-metadata";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export { sanitizeMetadata } from "@/lib/audit-metadata";

export type AuditAction = Enums<"audit_action">;

export type LogAuditInput = {
  teamId: string;
  userId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  environmentId?: string | null;
  /**
   * Context only — key names, counts, before/after role, that kind of
   * thing. Never a secret value, plaintext or encrypted. Passed through
   * sanitizeMetadata() regardless of what the caller sends.
   */
  metadata?: Record<string, unknown> | null;
};

/**
 * Writes one audit_logs row. Every mutation in this app — create, read/
 * reveal, update, delete, permission_change, invite — calls this exactly
 * once on success.
 *
 * Uses the RLS-bound client, not the admin client: the audit_logs INSERT
 * policy from Phase 11 ("Members can log their own actions") already
 * requires `user_id = auth.uid()` and team membership, which is precisely
 * what every caller here already has by the time it calls this — the real
 * enforcement is the same RLS everywhere else in this app, not a bypass.
 *
 * Never throws and never blocks the caller. A failed audit write is a
 * logging problem, not a reason to fail whatever the user actually asked
 * for — it's reported to the server console and nothing more, the same way
 * the reveal route's own audit write already did before this file existed.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("audit_logs").insert({
      team_id: input.teamId,
      user_id: input.userId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      environment_id: input.environmentId ?? null,
      metadata: sanitizeMetadata(input.metadata),
    });

    if (error) {
      console.error(
        `Failed to write audit log (${input.action} ${input.targetType} ${input.targetId}):`,
        error.message,
      );
    }
  } catch (error) {
    console.error(
      `Audit log threw (${input.action} ${input.targetType} ${input.targetId}):`,
      error instanceof Error ? error.message : error,
    );
  }
}
