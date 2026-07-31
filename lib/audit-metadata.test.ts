import { describe, expect, it } from "vitest";
import { sanitizeMetadata } from "@/lib/audit-metadata";

describe("sanitizeMetadata", () => {
  it("keeps a variable's key name — the one field the schema comment explicitly allows", () => {
    expect(sanitizeMetadata({ key: "STRIPE_SECRET_KEY" })).toEqual({ key: "STRIPE_SECRET_KEY" });
  });

  it("keeps ordinary context fields", () => {
    expect(sanitizeMetadata({ environment: "production", role: "admin", name: "Acme" })).toEqual({
      environment: "production",
      role: "admin",
      name: "Acme",
    });
  });

  it("strips every column the envelope encryption schema actually stores a secret in", () => {
    const dangerous = {
      key: "DATABASE_URL",
      value: "postgres://real-secret",
      encrypted_value: "base64ciphertext",
      encryptedDek: "base64wrappeddek",
      iv: "base64iv",
      auth_tag: "base64tag",
    };

    expect(sanitizeMetadata(dangerous)).toEqual({ key: "DATABASE_URL" });
  });

  it("strips secret-shaped words regardless of naming convention", () => {
    const variants = {
      plainValue: "x",
      PLAIN_SECRET: "x",
      apiToken: "x",
      user_password: "x",
      plaintext: "x",
      ciphertext: "x",
      credentials: "x",
    };

    expect(sanitizeMetadata(variants)).toEqual({});
  });

  it("does not false-positive on words that merely contain a forbidden substring", () => {
    // "iv" sits inside these, but never as its own word — a naive substring
    // match would wrongly strip all of them.
    expect(
      sanitizeMetadata({ isActive: true, invited_by: "user-id", environment: "dev" }),
    ).toEqual({ isActive: true, invited_by: "user-id", environment: "dev" });
  });

  it("recurses into nested objects, not just the top level", () => {
    // The dangerous key is stripped at whatever depth it appears at — the
    // object it lived in still exists (now empty), only the key itself is
    // gone.
    expect(
      sanitizeMetadata({
        key: "JWT_SECRET",
        change: { from: { value: "old-secret" }, to: { role: "admin" } },
      }),
    ).toEqual({ key: "JWT_SECRET", change: { from: {}, to: { role: "admin" } } });
  });

  it("passes arrays through, sanitizing any objects inside them", () => {
    expect(sanitizeMetadata({ items: [{ key: "A" }, { key: "B", secret: "no" }] })).toEqual({
      items: [{ key: "A" }, { key: "B" }],
    });
  });

  it("returns null for empty or missing metadata", () => {
    expect(sanitizeMetadata(null)).toBeNull();
    expect(sanitizeMetadata(undefined)).toBeNull();
  });
});
