import { createHmac, randomBytes } from "node:crypto";

/**
 * Invite tokens: 32 random bytes, base64url-encoded, handed out once inside an
 * invite link and never stored. What lands in team_invites.token_hash is an
 * HMAC-SHA256 digest of the token, keyed with INVITE_TOKEN_SECRET.
 *
 * Why keyed rather than a plain sha256: the digest is the only copy of the
 * token that persists, so it has to survive being read by someone who
 * shouldn't have it. An unkeyed digest is only as strong as the token's
 * entropy against an offline attacker with the database; a keyed one is
 * useless without a secret that lives in the app's environment and never in
 * Postgres — the same separation the master key gets in Phase 20.
 */

const TOKEN_BYTES = 32;

// base64url of 32 bytes is always 43 characters, unpadded.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function inviteTokenSecret(): string {
  const value = process.env.INVITE_TOKEN_SECRET;

  if (!value) {
    throw new Error(
      "Missing environment variable INVITE_TOKEN_SECRET. Copy .env.example to .env.local and generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }

  return value;
}

/** The digest stored in team_invites.token_hash for a given plaintext token. */
export function hashInviteToken(token: string): string {
  return createHmac("sha256", inviteTokenSecret()).update(token).digest("hex");
}

/**
 * A fresh token and its digest. The token is returned exactly once, to be put
 * in the invite link; nothing persists it.
 */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return { token, tokenHash: hashInviteToken(token) };
}

/**
 * Shape check on a token arriving from a URL, before it's hashed and sent to
 * Postgres. Nothing security-critical rests on this — a wrong-but-well-formed
 * token simply hashes to a digest that matches no row — it just keeps
 * arbitrary-length path segments out of the HMAC and turns obvious junk into a
 * clean "invalid link" instead of a database round trip.
 */
export function isWellFormedInviteToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
