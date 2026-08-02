"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme/constants";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function applyTheme(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", preference);
  }
}

/**
 * A 3-way toggle (System / Light / Dark), not a binary light↔dark switch —
 * the phase brief is "following the system preference with a manual
 * toggle that persists," which means the toggle has to be able to hand
 * control back to the system, not just start from it once.
 *
 * Renders a stable-sized placeholder until mount: the real state lives in
 * localStorage, which the server can't see, so guessing before hydration
 * would either mismatch or flash — same "resolve after mount" pattern as
 * GlobalSearch's Ctrl/Cmd label (Phase 33).
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    setPreference(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  function choose(value: ThemePreference) {
    setPreference(value);
    try {
      if (value === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, value);
      }
    } catch {
      // Privacy mode / storage disabled: the choice still applies for this
      // page load via applyTheme() below, it just won't persist. Silent —
      // there's nothing actionable for the user to do about it.
    }
    applyTheme(value);
  }

  if (preference === null) {
    return <div aria-hidden="true" className="h-7 w-[9.5rem]" />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex w-fit gap-0.5 rounded-lg border border-line bg-card p-0.5"
    >
      {OPTIONS.map((option) => {
        const isActive = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => choose(option.value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${focusRing} ${
              isActive ? "bg-paper text-ink shadow-sm" : "text-ink/50 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
