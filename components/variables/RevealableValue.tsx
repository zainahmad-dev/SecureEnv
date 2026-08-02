"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/variables/CopyButton";
import { useToast } from "@/components/toast/ToastProvider";

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
  const router = useRouter();
  const { showToast } = useToast();
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

      // The route already wrote the audit row (best-effort, server-side) —
      // this just re-fetches this page's Server Component data so the
      // Phase 31 activity panel picks up that new row without a manual
      // reload. router.refresh() re-renders server output in place; it
      // doesn't remount this client component, so the just-set revealed
      // state and its countdown above are unaffected.
      router.refresh();
    } catch {
      setState({ status: "error", message: "Network error." });
    }
  }

  // Always hits the network fresh, whether the value is currently masked
  // or already revealed on screen — never trusts an already-fetched
  // client-side value for the audit trail. This is what makes "copying is
  // an audited read, same as revealing" literally true: every copy click
  // is its own decrypt + its own audit_logs row on the server, not a
  // client-side clipboard write piggybacking on an earlier reveal.
  async function copyValue() {
    const response = await fetch(`/api/variables/${variableId}/reveal`, {
      method: "POST",
      cache: "no-store",
    });
    const body = await response.json();

    if (!response.ok) {
      const message = body.error ?? "Could not copy this value.";
      showToast(message, "error");
      throw new Error(message);
    }

    await navigator.clipboard.writeText(body.value);
    showToast("Copied to clipboard — logged as a read", "success");
    router.refresh();
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
          <CopyButton onCopy={copyValue} />
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
            className={`h-full rounded-full bg-accent transition-[width] ease-linear motion-reduce:transition-none ${
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
    // Named group so the copy icon's hover/focus affordance is scoped to
    // this one redaction bar, not every group ancestor on the page.
    <div className="group/mask relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={reveal}
        disabled={isLoading}
        aria-label={isLoading ? "Revealing value…" : "Click to reveal value"}
        aria-live="polite"
        className={`inline-block h-4 w-28 rounded bg-ink/15 transition-opacity hover:opacity-70 disabled:opacity-50 motion-reduce:transition-none ${focusRing}`}
      />
      {/* Hidden until hover/focus so a masked row reads as just a redaction
          bar at rest — visible via keyboard through group-focus-within,
          not hover alone, so it's reachable without a mouse. */}
      <CopyButton
        onCopy={copyValue}
        className="opacity-0 transition-opacity group-hover/mask:opacity-100 group-focus-within/mask:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
