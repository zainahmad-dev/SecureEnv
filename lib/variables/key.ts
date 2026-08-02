/**
 * The rules for what a variable *key* may look like, in one pure module.
 *
 * These lived inside lib/variables/actions.ts until Phase 38 needed them
 * outside a mutation for the first time (the AI generator has to reject a
 * suggested key before it ever reaches a form). They couldn't simply be
 * exported from there: a "use server" file is only allowed to export async
 * functions, so a shared constant or a synchronous validator has to live in
 * its own module regardless.
 *
 * Nothing here touches a value — keys are not secret (see the schema comment
 * on audit_logs.metadata), which is exactly why they can be validated,
 * logged, and rendered freely.
 */

export const KEY_MAX_LENGTH = 100;

// Starts with a letter (not a digit or underscore), then letters/digits/
// underscores — matches every real env var convention (DATABASE_URL,
// NEXT_PUBLIC_APP_URL) and everything the Phase 12 seed data already uses.
export const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Returns an error message for display, or null if the key is fine. */
export function validateKey(key: string): string | null {
  if (!key) return "Enter a variable key.";
  if (key.length > KEY_MAX_LENGTH) {
    return `Key must be ${KEY_MAX_LENGTH} characters or fewer.`;
  }
  if (!KEY_PATTERN.test(key)) {
    return "Use uppercase letters, numbers, and underscores only, starting with a letter.";
  }
  return null;
}

/**
 * NEXT_PUBLIC_ is Next.js's own convention for "gets inlined into the client
 * bundle at build time" — by that definition these values were never secret,
 * which is what lets the variables list decrypt and display them plainly
 * without breaking Phase 25's "no decryption on page load" rule (that rule is
 * about values that *are* secret).
 */
export function isPublicKey(key: string): boolean {
  return key.startsWith("NEXT_PUBLIC_");
}
