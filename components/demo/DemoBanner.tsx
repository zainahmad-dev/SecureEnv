"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "secureenv:demo-banner-dismissed";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * Says plainly that this is demo data, and gets out of the way once the
 * visitor has read it.
 *
 * Dismissal lives in localStorage rather than a cookie or the database.
 * A cookie would be sent on every request for a purely cosmetic client
 * preference, and the database is the one place it definitely can't go —
 * the demo account is read-only by RLS, so a demo visitor physically cannot
 * persist a preference server-side. localStorage is also correctly *per
 * browser*: the demo account is shared, and one visitor dismissing this
 * must not hide it from the next one.
 *
 * Rendered starting hidden and revealed in an effect, because the server
 * has no way to know what this browser's localStorage says — rendering it
 * visible first would flash the banner at someone who already dismissed it
 * on every single navigation.
 */
export function DemoBanner() {
  const [state, setState] = useState<"unknown" | "visible" | "dismissed">("unknown");

  useEffect(() => {
    try {
      setState(window.localStorage.getItem(STORAGE_KEY) === "1" ? "dismissed" : "visible");
    } catch {
      // Private browsing, or storage disabled entirely. Showing the banner
      // is the safe failure: the one thing worse than showing it twice is a
      // visitor who never learns the data isn't real.
      setState("visible");
    }
  }, []);

  function dismiss() {
    setState("dismissed");
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Dismissed for this page view regardless; it'll simply return on the
      // next navigation, which is a better outcome than throwing.
    }
  }

  if (state !== "visible") return null;

  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-2 min-[900px]:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-ink">
          <span className="font-semibold">Demo mode.</span> This is sample data on a shared
          read-only account — explore anything, but changes won&apos;t save.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium text-ink/60 hover:bg-accent/10 hover:text-ink ${focusRing}`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
