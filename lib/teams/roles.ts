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
