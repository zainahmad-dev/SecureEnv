"use client";

import { useState } from "react";

type CopyState = "idle" | "copying" | "copied" | "error";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const STATE_CLASSES: Record<CopyState, string> = {
  idle: "text-ink/50 hover:text-ink",
  copying: "text-ink/50",
  copied: "text-accent-dev",
  error: "text-danger",
};

function ClipboardIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="3" width="7" height="10.5" rx="1.25" />
      <path d="M6.5 3V2.25A1.25 1.25 0 0 1 7.75 1h.5A1.25 1.25 0 0 1 9.5 2.25V3" />
    </svg>
  );
}

/**
 * Purely presentational — `onCopy` is what actually copies (a network
 * round-trip through the reveal route for a secret, a plain
 * `navigator.clipboard.writeText` for an already-plaintext public value).
 * This just owns the inline idle → copying → copied/error → idle feedback
 * cycle so both call sites (RevealableValue, ValueCell's public branch)
 * don't duplicate it.
 */
export function CopyButton({
  onCopy,
  label = "Copy value",
  className = "",
}: {
  onCopy: () => Promise<void>;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");

  async function handleClick() {
    if (state === "copying") return;

    setState("copying");
    try {
      await onCopy();
      setState("copied");
    } catch {
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), 1600);
    }
  }

  const text = state === "copied" ? "Copied" : state === "error" ? "Failed" : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "copying"}
      aria-label={state === "copied" ? "Copied to clipboard" : state === "error" ? "Copy failed" : label}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-xs font-medium transition-colors disabled:opacity-50 motion-reduce:transition-none ${STATE_CLASSES[state]} ${focusRing} ${className}`}
    >
      {text ?? <ClipboardIcon />}
    </button>
  );
}
