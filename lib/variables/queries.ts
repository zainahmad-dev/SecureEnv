import { decryptSecret, DecryptionError } from "@/lib/crypto/envelope";
import { createClient } from "@/lib/supabase/server";
import { isPublicKey } from "@/lib/variables/key";

// Re-exported so this module stays the one import site for everything about
// reading variables; lib/variables/key.ts is what defines it now (Phase 38
// needed it from a pure, non-server module too).
export { isPublicKey };

export type VariableSummary = {
  id: string;
  key: string;
  description: string | null;
  updatedAt: string;
  isPublic: boolean;
  /** Decrypted plaintext, only ever populated for isPublic rows. */
  publicValue: string | null;
  /** True only if isPublic and decryption still failed (tampered/corrupt row). */
  decryptionFailed: boolean;
};

/**
 * An environment's variables, key order, with every value left encrypted
 * except NEXT_PUBLIC_ ones. Secret values are never touched here — masking
 * them is purely a matter of not selecting anything to decrypt in the first
 * place, not a display-layer decision made after the fact.
 */
export async function getEnvironmentVariables(environmentId: string): Promise<VariableSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("variables")
    .select("id, key, description, updated_at, encrypted_value, encrypted_dek, iv, auth_tag")
    .eq("environment_id", environmentId)
    .order("key", { ascending: true });

  return (data ?? []).map((row) => {
    const isPublic = isPublicKey(row.key);
    let publicValue: string | null = null;
    let decryptionFailed = false;

    if (isPublic) {
      try {
        publicValue = decryptSecret({
          encryptedValue: row.encrypted_value,
          encryptedDek: row.encrypted_dek,
          iv: row.iv,
          authTag: row.auth_tag,
        });
      } catch (error) {
        // A corrupted/tampered row shouldn't 500 the whole list — only this
        // one cell degrades. Logged without the row's encrypted fields: a
        // DecryptionError is already deliberately silent about *why* it
        // failed, so there's nothing sensitive to accidentally include.
        if (error instanceof DecryptionError) {
          console.error(`Failed to decrypt public variable ${row.id}`);
        }
        decryptionFailed = true;
      }
    }

    return {
      id: row.id,
      key: row.key,
      description: row.description,
      updatedAt: row.updated_at,
      isPublic,
      publicValue,
      decryptionFailed,
    };
  });
}
