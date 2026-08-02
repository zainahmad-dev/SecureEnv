"use client";

import { useEffect } from "react";
import { CenteredCard } from "@/components/shell/CenteredCard";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * Catches any error thrown below the root layout — the one boundary every
 * page in this app shares, since none of them nest inside a layout deeper
 * than `app/layout.tsx` itself (each page.tsx wraps its own AppShell rather
 * than inheriting a persistent one). Deliberately not wrapped in AppShell:
 * an error screen that itself depends on a fresh Server Component data
 * fetch (getSidebarData) could fail for the exact same reason the original
 * error did, taking the recovery screen down with it.
 *
 * Never renders `error.message` — in production Next.js already redacts a
 * Server Component error's message before it reaches this client boundary,
 * but this deliberately doesn't rely on that alone (see this phase's own
 * note: leaked internals are a real issue in a secrets product, not just an
 * ugly screen). `error.digest` is the one thing Next explicitly designs to
 * be safe to show — an opaque reference id, not the message itself.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Browser console only, for whoever's looking at this screen live —
    // the real failure is already logged server-side wherever it was thrown.
    console.error(error);
  }, [error]);

  return (
    <CenteredCard>
      <h1 className="mb-1 text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="mb-1 text-sm text-ink/60">
        That didn&apos;t work, and it&apos;s on us, not something you did. Try again — if it keeps
        happening, head back to your dashboard instead.
      </p>
      {error.digest && (
        <p className="mb-6 text-xs text-ink/40">Reference: {error.digest}</p>
      )}
      {!error.digest && <div className="mb-6" />}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={reset}
          className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accent/90 ${focusRing}`}
        >
          Try again
        </button>
        {/* A plain reload, not a client-side <Link> navigation — an error of
            unknown origin shouldn't be recovered from by reusing whatever
            router/client state might have contributed to it. */}
        <a
          href="/dashboard"
          className={`rounded-lg border border-line bg-paper px-4 py-2 text-center text-sm font-medium text-ink hover:bg-card ${focusRing}`}
        >
          Go to dashboard
        </a>
      </div>
    </CenteredCard>
  );
}
