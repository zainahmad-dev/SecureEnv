"use client";

import { useState } from "react";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * A read-only field holding a URL, plus a copy button. The field itself stays
 * selectable and selects-on-focus, so the link is still recoverable if the
 * Clipboard API is unavailable (it needs a secure context, so plain-HTTP
 * previews don't get it).
 */
export function CopyableLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission or no secure context — the field is still
      // there to select by hand, so there's nothing useful to report.
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className={`w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink ${focusRing}`}
      />
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-card ${focusRing}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
