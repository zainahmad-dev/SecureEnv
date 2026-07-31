"use client";

import { useEffect, useRef, useState } from "react";

const REVEAL_DURATION_MS = 15_000;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

type RevealState =
  | { status: "masked" }
  | { status: "loading" }
  | { status: "revealed"; value: string }
  | { status: "error"; message: string };

/**
 * Never bulk-decrypts anything — each instance fetches exactly the one
 * variable it renders, on click, never on mount. The 15-second countdown
 * bar is a real CSS transition (not a re-rendered percentage), started one
 * frame after the revealed state paints so the browser has a "before" width
 * to animate from.
 */
export function RevealableValue({ variableId }: { variableId: string }) {
  const [state, setState] = useState<RevealState>({ status: "masked" });
  const [collapsing, setCollapsing] = useState(false);
  const remaskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (remaskTimer.current) clearTimeout(remaskTimer.current);
    };
  }, []);

  async function reveal() {
    setState({ status: "loading" });

    try {
      const response = await fetch(`/api/variables/${variableId}/reveal`, {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json();

      if (!response.ok) {
        setState({ status: "error", message: body.error ?? "Could not reveal this value." });
        return;
      }

      setState({ status: "revealed", value: body.value });
      setCollapsing(false);
      requestAnimationFrame(() => setCollapsing(true));
      remaskTimer.current = setTimeout(() => setState({ status: "masked" }), REVEAL_DURATION_MS);
    } catch {
      setState({ status: "error", message: "Network error." });
    }
  }

  function remaskNow() {
    if (remaskTimer.current) clearTimeout(remaskTimer.current);
    setState({ status: "masked" });
  }

  if (state.status === "error") {
    return (
      <button
        type="button"
        onClick={reveal}
        className={`text-xs text-danger underline decoration-dotted ${focusRing}`}
      >
        {state.message} Try again.
      </button>
    );
  }

  if (state.status === "revealed") {
    return (
      <div className="flex flex-col gap-1" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <code className="truncate rounded bg-card px-2 py-1 font-mono text-xs text-ink">
            {state.value}
          </code>
          <span className="text-xs text-ink/50">revealed · logged</span>
          <button
            type="button"
            onClick={remaskNow}
            className={`text-xs text-ink/50 underline decoration-dotted hover:text-ink ${focusRing}`}
          >
            Hide
          </button>
        </div>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full bg-accent transition-[width] ease-linear ${
              collapsing ? "w-0" : "w-full"
            }`}
            style={{ transitionDuration: `${REVEAL_DURATION_MS}ms` }}
          />
        </div>
      </div>
    );
  }

  const isLoading = state.status === "loading";

  return (
    <button
      type="button"
      onClick={reveal}
      disabled={isLoading}
      aria-label={isLoading ? "Revealing value…" : "Click to reveal value"}
      aria-live="polite"
      className={`inline-block h-4 w-28 rounded bg-ink/15 transition-opacity hover:opacity-70 disabled:opacity-50 ${focusRing}`}
    />
  );
}
