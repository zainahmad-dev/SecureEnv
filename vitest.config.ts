import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*": ["./*"] — Vitest doesn't read
      // tsconfig paths itself, so the alias has to be declared again here.
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Only real Vitest suites (*.test.ts). The scripts/test-*.ts files are
    // unrelated standalone smoke scripts run directly via tsx against a live
    // Supabase project (see package.json's test:rls/test:members/etc.) — a
    // different naming convention (test-*.ts, not *.test.ts) on purpose, and
    // Vitest's default include pattern already wouldn't match them, but this
    // is explicit so the distinction isn't left to a naming coincidence.
    include: ["**/*.test.ts"],
    // A fixed, valid-format key used only by the test run — never the real
    // MASTER_KEY from .env.local. lib/crypto/master-key.ts validates at
    // import time, so every suite that touches lib/crypto/envelope.ts needs
    // some value present before that import resolves. This value protects
    // nothing real; it's a test fixture, not a secret.
    env: {
      MASTER_KEY: "27ab08facd312783770ba9adecb3bfa7ca88a7fc880b5e1caa0fe671cf68f9ab",
    },
  },
});
