/**
 * Split out of client.ts specifically so it can be unit-tested without
 * pulling in that file's `server-only` import — under plain Vitest (not
 * Next's bundler, which is what actually gives `server-only` its real
 * client/server split), importing `server-only` unconditionally throws
 * ("This module cannot be imported from a Client Component module"), the
 * same constraint that made Phase 29 split lib/audit-metadata.ts out of
 * lib/audit.ts. This file has no server-only dependency of its own — it's
 * pure string matching — so it's safe to import from anywhere, including a
 * test file.
 */

/**
 * Deliberately its own error, outside callAI()'s AIClientError hierarchy —
 * those represent the AI *provider* failing in some way; this one means
 * *we* refused to even place the call. This is the one hard rule this
 * module enforces in code, not just in a comment: no decrypted secret value
 * may ever reach a prompt.
 */
export class PromptContainsSecretError extends Error {
  constructor() {
    super(
      "Refused to call the AI provider: the prompt contains something that looks like a live secret value.",
    );
    this.name = "PromptContainsSecretError";
  }
}

// Deliberately pattern-based, not a full secret-scanner — this only needs to
// catch the shapes a *decrypted variable value* is likely to actually take
// (the same provider-key shapes Phase 39's scanner will look for), not
// author a general secrets-detection engine. It cannot catch a genuinely
// arbitrary secret (a random internal password with no recognisable shape),
// which is exactly why the real guarantee is architectural: nothing in this
// codebase's AI-facing code path ever calls decryptSecret() and hands the
// result to callAI() — this check is defense in depth on top of that, not
// instead of it.
const SECRET_LIKE_PATTERNS: RegExp[] = [
  /\bsk_(live|test)_[A-Za-z0-9]{10,}\b/, // Stripe secret keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key IDs
  /\bAIza[0-9A-Za-z_-]{35,}\b/, // Google API keys
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, // GitHub tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack tokens
  /\bre_[A-Za-z0-9_]{16,}\b/, // Resend API keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private keys
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/, // JWTs
  /\b\w+:\/\/[^\s:@/]+:[^\s:@/]+@[^\s/]+/, // connection strings with an embedded user:password@host
];

/** Throws PromptContainsSecretError if `text` contains anything shaped like a live secret value. */
export function assertNoSecretLikeContent(text: string): void {
  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(text)) throw new PromptContainsSecretError();
  }
}
