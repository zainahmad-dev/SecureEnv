import { randomBytes } from "crypto";

/**
 * The master key encrypts every per-secret data-encryption-key (DEK) — see
 * the envelope encryption module this key exists to serve. It must never be
 * stored in the database: encrypted DEKs already live there, and a key kept
 * alongside the data it protects protects nothing — a single database breach
 * would hand an attacker both the ciphertext and the key to open it. Kept
 * only in an environment variable (set once per deployment, never committed,
 * never derived from anything else in this system), a database-only breach
 * yields nothing but unreadable bytes.
 */

const MASTER_KEY_BYTES = 32;
const MASTER_KEY_HEX_LENGTH = MASTER_KEY_BYTES * 2;
const HEX_PATTERN = /^[0-9a-f]+$/i;

const GENERATE_COMMAND = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;

function loadMasterKey(): Buffer {
  const raw = process.env.MASTER_KEY;

  if (!raw) {
    throw new Error(
      "MASTER_KEY is not set. Every stored secret depends on it, so the app " +
        `won't start without one. Generate one with:\n  ${GENERATE_COMMAND}\n` +
        "then set MASTER_KEY to that value in your environment (.env.local for " +
        "local development, your host's dashboard for deployments). Never commit it.",
    );
  }

  // Checked before decoding, not after: Buffer.from(str, "hex") silently
  // stops at the first invalid pair instead of throwing, so a malformed key
  // would otherwise decode to some shorter-than-expected buffer rather than
  // failing loudly here. Never interpolate `raw` into either message below —
  // a malformed key is still a key.
  if (raw.length !== MASTER_KEY_HEX_LENGTH || !HEX_PATTERN.test(raw)) {
    throw new Error(
      `MASTER_KEY is malformed. It must be exactly ${MASTER_KEY_HEX_LENGTH} hex characters ` +
        `(${MASTER_KEY_BYTES} bytes). Generate a new one with:\n  ${GENERATE_COMMAND}`,
    );
  }

  return Buffer.from(raw, "hex");
}

/** The 32-byte master key, decoded once at import time — see loadMasterKey for validation. */
export const masterKey: Buffer = loadMasterKey();

/**
 * Generates a fresh, random master key as a hex string. Not called anywhere
 * in the app itself — this is the function behind the CLI command above,
 * exposed as a plain function so it has one canonical implementation instead
 * of the shell command being the only copy of the logic.
 */
export function generateMasterKey(): string {
  return randomBytes(MASTER_KEY_BYTES).toString("hex");
}
