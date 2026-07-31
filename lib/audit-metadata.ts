import type { Json } from "@/types/database";

// Matched as a whole word (split on case changes and non-alphanumerics), not
// a substring — a bare "value" (or "values") anywhere in a key name, plus
// every column the envelope-encryption schema actually stores a secret or a
// cryptographic material in. Deliberately does NOT include "key": Phase 24's
// own metadata convention is {"key": "API_KEY"} — a variable's *name*, which
// is not secret — and the schema comment this mirrors says exactly that.
const FORBIDDEN_WORDS = new Set([
  "value",
  "values",
  "secret",
  "secrets",
  "password",
  "passwords",
  "token",
  "tokens",
  "dek",
  "iv",
  "tag",
  "plaintext",
  "ciphertext",
  "credential",
  "credentials",
]);

function wordsOf(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

function isForbiddenKey(key: string): boolean {
  return wordsOf(key).some((word) => FORBIDDEN_WORDS.has(word));
}

function sanitizeValue(value: unknown): Json | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item) ?? null) as Json;
  }
  if (value !== null && typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

/**
 * Strips any key that resembles a secret-value field, at every level —
 * metadata is expected to be a flat {"key": "..."} shape in practice, but
 * this recurses into any nested object anyway so a future caller who builds
 * metadata from a bigger struct without thinking about it doesn't get a
 * free pass just because the field is one level deeper.
 *
 * Kept in its own module, separate from lib/audit.ts's logAudit(): this
 * function is pure (no Supabase, no Next.js server context), which is what
 * lets lib/audit.test.ts actually import and exercise it directly — the
 * moment this lived in the same file as `createClient()`, importing it at
 * all would eagerly run lib/supabase/env.ts's fail-loud validation and
 * throw outside a real request.
 */
export function sanitizeMetadata(input: Record<string, unknown> | null | undefined): Json | null {
  if (!input) return null;

  const clean: Record<string, Json> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isForbiddenKey(key)) continue;
    const sanitized = sanitizeValue(value);
    if (sanitized !== undefined) clean[key] = sanitized;
  }
  return clean;
}
