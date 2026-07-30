import { randomBytes } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { DecryptionError, decryptSecret, encryptSecret, type EncryptedSecret } from "./envelope";

/** Flips one bit so a base64 field decodes to a different (same-length) buffer. */
function tamper(base64: string): string {
  const buffer = Buffer.from(base64, "base64");
  buffer[buffer.length - 1] ^= 0xff;
  return buffer.toString("base64");
}

describe("encryptSecret / decryptSecret round trip", () => {
  it("returns the original value for a typical secret", () => {
    // Deliberately not shaped like any real provider's key format — a
    // fixture that happens to match a known secret pattern trips GitHub's
    // push protection even though it's fake.
    const plaintext = "example-api-key-do-not-use-1234567890";
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("survives unicode", () => {
    const plaintext = "pa55w0rd — héllo 🔐 世界 — ñoño";
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("survives a very long value", () => {
    const plaintext = randomBytes(50_000).toString("base64");
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it("handles an empty string", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });
});

describe("randomness", () => {
  it("produces different ciphertext for the same plaintext encrypted twice", () => {
    const plaintext = "the same value, twice";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);

    // Every random component — the value's IV, the wrapped DEK (itself a
    // fresh DEK under a fresh IV), and therefore the ciphertext it produces
    // — should differ between calls. A collision in any of these would mean
    // an IV or DEK got reused, which is the one thing GCM can't tolerate.
    expect(a.encryptedValue).not.toBe(b.encryptedValue);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encryptedDek).not.toBe(b.encryptedDek);
  });
});

describe("tamper detection", () => {
  const plaintext = "a secret value";

  it("throws DecryptionError when encryptedValue is tampered with", () => {
    const encrypted = encryptSecret(plaintext);
    const tampered: EncryptedSecret = { ...encrypted, encryptedValue: tamper(encrypted.encryptedValue) };

    expect(() => decryptSecret(tampered)).toThrow(DecryptionError);
  });

  it("throws DecryptionError when authTag is tampered with", () => {
    const encrypted = encryptSecret(plaintext);
    const tampered: EncryptedSecret = { ...encrypted, authTag: tamper(encrypted.authTag) };

    expect(() => decryptSecret(tampered)).toThrow(DecryptionError);
  });

  it("throws DecryptionError when encryptedDek is tampered with", () => {
    const encrypted = encryptSecret(plaintext);
    const tampered: EncryptedSecret = { ...encrypted, encryptedDek: tamper(encrypted.encryptedDek) };

    expect(() => decryptSecret(tampered)).toThrow(DecryptionError);
  });

  it("throws DecryptionError when the iv is tampered with", () => {
    const encrypted = encryptSecret(plaintext);
    const tampered: EncryptedSecret = { ...encrypted, iv: tamper(encrypted.iv) };

    expect(() => decryptSecret(tampered)).toThrow(DecryptionError);
  });

  it("never includes the plaintext in a thrown error's message", () => {
    const secret = "a very specific value — 12345 — do not leak me";
    const encrypted = encryptSecret(secret);
    const tampered: EncryptedSecret = { ...encrypted, encryptedValue: tamper(encrypted.encryptedValue) };

    try {
      decryptSecret(tampered);
      expect.unreachable("decryptSecret should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DecryptionError);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("throws DecryptionError when decrypted under a different master key", async () => {
    const encrypted = encryptSecret(plaintext);

    const originalKey = process.env.MASTER_KEY;
    // Guaranteed to differ from the fixed test key in vitest.config.ts.
    process.env.MASTER_KEY = randomBytes(32).toString("hex");
    vi.resetModules();

    try {
      // A fresh import re-runs lib/crypto/master-key.ts's module-load
      // validation against the new env value, so this module (and its
      // masterKey) is a genuinely different instance from the one the rest
      // of this file imported at the top. Its own DecryptionError export is
      // used below too — after vi.resetModules(), it's a distinct class
      // from the top-level import, so asserting against the wrong one would
      // fail an instanceof check even though the behaviour is correct.
      const reloaded = await import("./envelope");
      expect(() => reloaded.decryptSecret(encrypted)).toThrow(reloaded.DecryptionError);
    } finally {
      process.env.MASTER_KEY = originalKey;
      vi.resetModules();
    }
  });
});
