// Runs once when a new Next.js server instance starts — the only reliable
// place to make "the app refuses to boot with a missing or malformed master
// key" literally true. Nothing imports lib/crypto/master-key.ts yet on any
// request path (the encryption module that will is a later phase), so
// without this hook the fail-loud check in that file would just sit dead
// until something happened to import it.
//
// Note this is a boot-time check, not a build-time one: register() runs
// when the server starts (next dev / next start), not during next build —
// unlike the Supabase env checks in lib/supabase/env.ts, which fail the
// build too, because real route modules already import them for "Collecting
// page data". A missing MASTER_KEY only surfaces once the server actually
// tries to run.
export async function register() {
  // This project's middleware runs on the Edge runtime (Next's default for
  // middleware), so register() also fires once for an edge context — where
  // Node's crypto module isn't available. Guard so the master key is only
  // loaded in the Node.js runtime that will actually use it.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/crypto/master-key");
  }
}
