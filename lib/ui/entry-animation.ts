import type { CSSProperties } from "react";

/**
 * Shared "staggered entry" for list rows (Phase 32) — a single mount-time
 * animation, not a re-triggerable one: React keeps the same DOM node across
 * a row's own state changes (e.g. toggling into/out of its edit form) since
 * the key and element type never change, so this only ever plays once per
 * row, the first time it's actually inserted into the DOM (initial list
 * render, or a brand-new row after create). `motion-safe:` means the
 * `animate-*` utility — and therefore its `backwards`-filled `opacity: 0`
 * starting frame — never applies at all under prefers-reduced-motion, so a
 * reduced-motion visitor sees fully-visible rows with no fallback needed.
 */
export const ENTRY_ANIMATION_CLASS = "motion-safe:animate-[row-in_0.3s_ease-out_backwards]";

const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 8;

export function entryAnimationStyle(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS}ms` };
}
