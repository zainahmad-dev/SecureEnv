import type { Enums } from "@/types/database";

export type TeamRole = Enums<"team_role">;

/**
 * Declaration order matches the enum in Postgres, which is also its privilege
 * rank (see is_team_member in the Phase 11 migration) — most privileged first.
 */
export const TEAM_ROLES: readonly TeamRole[] = ["admin", "member", "readonly"];

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Admin",
  member: "Member",
  readonly: "Read-only",
};

/** Written to complete the sentence "Admin — …", for role pickers. */
export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  admin: "full control, including projects and members",
  member: "can read and change variables",
  readonly: "can view variables, but never change them",
};

/**
 * True when `role` is at least as privileged as `minRole`. Mirrors the SQL
 * `is_team_member`'s own "role <= min_role" trick from the Phase 11
 * migration — TEAM_ROLES is declared most-privileged-first, so a lower
 * index means more privilege, and the comparison is the same array-order
 * trick on both sides of the stack rather than two different notions of
 * "sufficient role."
 */
export function roleAtLeast(role: TeamRole, minRole: TeamRole): boolean {
  return TEAM_ROLES.indexOf(role) <= TEAM_ROLES.indexOf(minRole);
}
