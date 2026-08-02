"use client";

/**
 * The one error boundary `app/error.tsx` can't cover: a failure in the root
 * `app/layout.tsx` itself. Next.js requires this file to render its own
 * `<html>`/`<body>` — triggering it replaces the entire root layout, not
 * just the page content, so there's nothing above it left to provide those
 * tags. Kept intentionally simpler than app/error.tsx (no CenteredCard,
 * fewer moving parts) since this is the last line of defence if something
 * even more basic than a page failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink">
        <div className="w-full max-w-sm rounded-xl border border-line bg-card p-6 text-center shadow-sm">
          <h1 className="mb-1 text-xl font-semibold">SecureEnv hit a problem</h1>
          <p className="mb-1 text-sm text-ink/60">
            The app failed to load. Try again — if it keeps happening, the problem is on our end,
            not something you did.
          </p>
          {error.digest && <p className="mb-6 text-xs text-ink/40">Reference: {error.digest}</p>}
          {!error.digest && <div className="mb-6" />}
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:bg-accent/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
