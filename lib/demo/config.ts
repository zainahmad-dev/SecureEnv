import { DEMO_ACCOUNT_EMAIL, DEMO_PASSWORD } from "@/lib/demo/fixture";

/**
 * Whether this deployment offers one-click demo access, and what
 * credentials it uses.
 *
 * Read lazily inside functions rather than at module load — the same
 * server-only convention lib/supabase/admin.ts and lib/ai/client.ts already
 * follow, and the reason this module is safe to import from a Server
 * Component that also renders client children. DEMO_USER_PASSWORD must
 * never reach the browser; the only thing that ever crosses to the client
 * is the boolean from isDemoConfigured().
 *
 * Both variables default to the seeded fixture account, so a fresh clone
 * that has run `npm run seed` gets a working demo button with no extra
 * configuration. A real deployment can point them at a different account
 * without touching code.
 */
export function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_USER_EMAIL?.trim() || DEMO_ACCOUNT_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD || DEMO_PASSWORD;

  // An explicitly blanked password is the opt-out: a deployment that wants
  // no public demo sets DEMO_USER_PASSWORD to an empty string.
  if (!email || !password) return null;

  return { email, password };
}

/**
 * Whether to render the "Explore the demo" button at all.
 *
 * Absent rather than disabled when there's no demo account — the same
 * pattern the rest of this app uses for actions a viewer can't take. A
 * button that always fails is worse than no button.
 */
export function isDemoConfigured(): boolean {
  return demoCredentials() !== null;
}
