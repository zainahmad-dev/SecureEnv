import type { Severity } from "@/lib/scanner/types";

/** Display-only metadata for severities, kept separate from rules.ts/ai.ts the same way lib/environments/presentation.ts keeps display data out of its queries file. */
export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Reserves colour for what's actually risky rather than reusing the
 * dev/staging/production accent palette a second time on a different axis.
 * A finding already carries its own environment context elsewhere on this
 * panel (the tab it's grouped under, its Fix link's target) — a severity
 * badge painted in an environment's accent would collide with that meaning
 * instead of adding to it, the same reasoning lib/audit/presentation.ts
 * gives for keeping its own action-badge palette separate from this one.
 */
const SEVERITY_BADGE_CLASSES: Record<Severity, string> = {
  critical: "border-transparent bg-danger text-paper",
  high: "border-danger/40 bg-danger/10 text-danger",
  medium: "border-line bg-card text-ink/70",
  low: "border-line bg-card text-ink/50",
};

export function severityBadgeClass(severity: Severity): string {
  return SEVERITY_BADGE_CLASSES[severity];
}
