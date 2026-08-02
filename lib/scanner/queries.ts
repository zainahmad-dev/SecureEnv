import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, DecryptionError } from "@/lib/crypto/envelope";
import type { ScanProject } from "@/lib/scanner/types";
import type { Database } from "@/types/database";

/**
 * Loads one project's environments and variables and decrypts every value
 * for a scan.
 *
 * **This is the only place in the scanner where plaintext comes into
 * existence.** It is held in the returned ScanProject, handed to the pure
 * rules in rules.ts, and dropped when that object goes out of scope —
 * nothing here writes, caches, or logs a value.
 *
 * This is a deliberate, narrow exception to Phase 25's "decrypt one value at
 * a time, on explicit request" rule. That rule is about page loads: a
 * variables list must never bulk-decrypt just to render. A scan is the
 * opposite case — it is an explicit, user-initiated action whose entire
 * purpose is to compare values against each other, and rules like "the same
 * value used by two or more variables" cannot be expressed any other way.
 * The mitigation is that the plaintext never leaves this function's return
 * value: Findings carry lengths and key names only (see lib/scanner/types.ts).
 *
 * Takes the Supabase client rather than building one, for two reasons: the
 * app passes its RLS-bound server client so a scan can only ever read
 * projects the caller can already see, and scripts/test-scanner.ts passes a
 * service-role client — importing lib/supabase/server.ts here would drag
 * next/headers into a plain tsx run and break that script outright.
 */
export async function loadProjectForScan(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<ScanProject | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const { data: environments } = await supabase
    .from("environments")
    .select(
      "id, name, sort_order, variables(id, key, updated_at, encrypted_value, encrypted_dek, iv, auth_tag)",
    )
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  return {
    id: project.id,
    name: project.name,
    environments: (environments ?? []).map((environment) => ({
      id: environment.id,
      name: environment.name,
      variables: (environment.variables ?? []).flatMap((row) => {
        try {
          return [
            {
              id: row.id,
              key: row.key,
              value: decryptSecret({
                encryptedValue: row.encrypted_value,
                encryptedDek: row.encrypted_dek,
                iv: row.iv,
                authTag: row.auth_tag,
              }),
              updatedAt: row.updated_at,
            },
          ];
        } catch (error) {
          // A corrupted or tampered row shouldn't abort the whole scan —
          // every other variable is still worth checking. Logged by id
          // only: DecryptionError is deliberately silent about why it
          // failed, and there is no plaintext to accidentally include.
          if (error instanceof DecryptionError) {
            console.error(`Scan skipped variable ${row.id}: value could not be decrypted`);
          }
          return [];
        }
      }),
    })),
  };
}
