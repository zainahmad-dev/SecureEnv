import type { AuditAction } from "@/lib/audit/queries";

/**
 * "read" only ever fires from the variable reveal route (see
 * lib/audit.ts's callers) — nothing else in this app logs a plain read —
 * so "Reveal" is the honest, specific label, not generic filler.
 */
export const ACTION_LABELS: Record<AuditAction, string> = {
  create: "Create",
  read: "Reveal",
  update: "Update",
  delete: "Delete",
  permission_change: "Permission change",
  invite: "Invite",
};

/**
 * Colour-coded by how consequential the action is, reusing the same
 * safe/caution/danger hues the environment tiers already established
 * (dev teal = safe, staging amber = caution, production crimson-adjacent
 * `danger` = destructive) rather than inventing a parallel palette. Read
 * and invite are lower-stakes and deliberately neutral, so the coloured
 * badges draw the eye to what actually changed something.
 */
const ACTION_BADGE_CLASSES: Record<AuditAction, string> = {
  create: "border-accent-dev/30 bg-accent-dev/10 text-accent-dev",
  update: "border-accent-staging/30 bg-accent-staging/10 text-accent-staging",
  delete: "border-danger/30 bg-danger/10 text-danger",
  permission_change: "border-accent/30 bg-accent/10 text-accent",
  read: "border-line bg-card text-ink/70",
  invite: "border-line bg-card text-ink/70",
};

export function actionBadgeClass(action: AuditAction): string {
  return ACTION_BADGE_CLASSES[action];
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  variable: "Variable",
  environment: "Environment",
  project: "Project",
  team: "Team",
  team_member: "Member",
  invite: "Invite",
};

export function targetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] ?? targetType;
}

/**
 * A human-readable detail for the target column, derived from whatever
 * logAudit() was given as metadata for that action — never from target_id
 * itself, which is meaningless to a reader. Each target_type's metadata
 * shape comes straight from the logAudit() calls in every actions file
 * under lib/ (Phase 29); this is the read-side mirror of those write-side
 * shapes, not an independent source of truth, so a new metadata field
 * there needs a matching case added here to actually show up.
 */
export function describeAuditTarget(row: {
  targetType: string;
  metadata: Record<string, unknown> | null;
}): string | null {
  const meta = row.metadata ?? {};
  const str = (field: string): string | null => (typeof meta[field] === "string" ? (meta[field] as string) : null);

  switch (row.targetType) {
    case "variable":
      return str("key");
    case "environment": {
      const name = str("name");
      if (name) return name;
      const from = str("from");
      const to = str("to");
      return from && to ? `${from} → ${to}` : null;
    }
    case "project":
    case "team":
      return str("name");
    case "team_member": {
      const from = str("from");
      const to = str("to");
      if (from && to) return `${from} → ${to}`;
      return str("role");
    }
    case "invite":
      return str("email");
    default:
      return null;
  }
}
