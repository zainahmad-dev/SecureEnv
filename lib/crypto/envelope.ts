import { createCipheriv, randomBytes } from "crypto";
import { masterKey } from "@/lib/crypto/master-key";

/**
 * Envelope encryption: every secret value is encrypted under its own
 * one-time data-encryption-key (DEK), and that DEK is itself encrypted
 * under the single master key before either touches the database. Two
 * layers rather than one because the master key then never encrypts a
 * secret value directly — only ever a DEK — which is what would make key
 * rotation (re-wrapping every DEK under a new master key) possible later
 * without having to re-encrypt every stored value.
 */

const ALGORITHM = "aes-256-gcm";
const DEK_LENGTH = 32; // 256-bit DEK, matching AES-256 and the master key's own length
// 96 bits — the length AES-GCM is designed for. A longer IV would be hashed
// down to 96 bits internally by Node's OpenSSL binding, which weakens the
// construction rather than adding security, so this must stay exactly 12.
const IV_LENGTH = 12;
// 128-bit GCM authentication tag — the maximum GCM defines, and Node's
// default. Passed explicitly to createCipheriv rather than left implicit,
// so the assumption this module (and Phase 22's decryption) relies on is
// visible in code, not just in behaviour.
const AUTH_TAG_LENGTH = 16;

export type EncryptedSecret = {
  /** The secret value, encrypted under a one-time DEK. Base64. */
  encryptedValue: string;
  /**
   * The DEK, encrypted under the master key — bundled as one base64 blob
   * (iv || authTag || ciphertext) because the database has no separate
   * columns for this inner encryption's own IV and tag. The `iv` and
   * `authTag` fields below belong only to `encryptedValue`.
   */
  encryptedDek: string;
  /** The IV used to encrypt encryptedValue. Base64. */
  iv: string;
  /** The GCM auth tag for encryptedValue, required to detect tampering on decrypt. Base64. */
  authTag: string;
};

/**
 * Encrypts a DEK under the master key with a fresh random IV, returning
 * iv || authTag || ciphertext as one base64 blob. Fixed-length fields first
 * (12-byte IV, 16-byte tag) so unwrapping it later (Phase 22) is a plain
 * byte-offset slice — no length-prefixing needed for the variable-length
 * ciphertext that follows.
 */
function wrapDek(dek: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Encrypts a plaintext secret value for storage. Never call this with a
 * value you intend to log, cache, or persist anywhere but through its
 * return value — the plaintext argument exists in memory only for the
 * duration of this call.
 *
 * Steps:
 * 1. Generate a fresh 256-bit DEK — unique to this one value. It is never
 *    reused across variables or across edits to the same variable (editing
 *    a value generates a brand new DEK rather than re-wrapping the old one).
 * 2. Generate a fresh 96-bit IV for this encryption. AES-GCM's security
 *    depends on never reusing an (key, IV) pair, so a new random IV is
 *    required on every single call — not just once per DEK.
 * 3. Encrypt the plaintext with AES-256-GCM under the DEK. GCM authenticates
 *    as it encrypts, producing both ciphertext and a 128-bit auth tag; the
 *    tag is what lets decryption detect tampering instead of silently
 *    returning corrupted plaintext.
 * 4. Encrypt the DEK itself under the master key (its own random IV and
 *    tag — see wrapDek) so the master key never touches a secret value
 *    directly, only ever wraps a DEK.
 * 5. Return everything as base64 strings, matching the variables table's
 *    encrypted_value / encrypted_dek / iv / auth_tag columns exactly.
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const dek = randomBytes(DEK_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, dek, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: ciphertext.toString("base64"),
    encryptedDek: wrapDek(dek),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}
