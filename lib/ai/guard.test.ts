import { describe, expect, it } from "vitest";
import { assertNoSecretLikeContent, PromptContainsSecretError } from "@/lib/ai/guard";

describe("assertNoSecretLikeContent", () => {
  it("does not throw on ordinary prompt text", () => {
    expect(() =>
      assertNoSecretLikeContent("Suggest a list of environment variables a Next.js app commonly needs."),
    ).not.toThrow();
  });

  it("does not throw on a variable key name alone", () => {
    // Keys are never secret by themselves — only values are — so a prompt
    // that only mentions "STRIPE_SECRET_KEY" as a name must stay allowed.
    expect(() => assertNoSecretLikeContent("The variable is named STRIPE_SECRET_KEY.")).not.toThrow();
  });

  // Every fake value below has the right prefix and enough characters to
  // trip this module's own regex, but is deliberately *shorter* than the
  // real provider's actual key length (e.g. a real Stripe key is 24
  // base62 characters after the prefix; these are ~14) — long enough to
  // match SECRET_LIKE_PATTERNS' open-ended {10,}/{16,} minimums, short
  // enough to fall under GitHub's own secret-scanning length thresholds,
  // which flagged an earlier, longer version of these same fixtures as a
  // real Stripe key. Same "fake but not detector-shaped" principle
  // scripts/seed.ts already established, just tuned for a different
  // detector (GitHub's push protection here, rather than a length/charset
  // scanner in that script's case).
  const secretShaped: [string, string][] = [
    ["Stripe secret key", "sk_live_FAKEKEYNOTREAL"],
    ["Stripe test key", "sk_test_FAKEKEYNOTREAL"],
    ["AWS access key ID", "AKIAFAKE1234567890AB"],
    ["Google API key", "AIzaFAKE1234567890abcdefghijklmnopqrstuv"],
    ["GitHub personal access token", "ghp_FAKE1234567890abcdefghijklmnopqrstuv"],
    ["Slack bot token", "xoxb-FAKE-1234567890-abcdefghijklmnop"],
    ["Resend API key", "re_FAKE1234567890abcdefghij"],
    ["PEM private key header", "-----BEGIN RSA PRIVATE KEY-----"],
    [
      "a JWT",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzbm90YXJlYWxzaWduYXR1cmU",
    ],
    ["a connection string with embedded credentials", "postgres://demo_user:demo_password@db.example.com/app"],
  ];

  it.each(secretShaped)("throws PromptContainsSecretError for a %s", (_label, value) => {
    expect(() => assertNoSecretLikeContent(`Here is the value: ${value}`)).toThrow(PromptContainsSecretError);
  });

  it("checks the whole string, not just the start", () => {
    expect(() =>
      assertNoSecretLikeContent(
        "Please review this configuration and suggest improvements: sk_live_FAKEKEYNOTREAL",
      ),
    ).toThrow(PromptContainsSecretError);
  });
});
