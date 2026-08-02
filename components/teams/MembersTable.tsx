import { MemberRoleForm } from "@/components/teams/MemberRoleForm";
import { RemoveMemberButton } from "@/components/teams/RemoveMemberButton";
import { formatDate } from "@/lib/format/date";
import type { TeamMember } from "@/lib/teams/queries";
import { ROLE_LABELS } from "@/lib/teams/roles";

const badgeClass = "rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-ink/70";
const cellClass = "px-3 py-3 align-middle";
const headingCellClass = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide";

type MembersTableProps = {
  members: TeamMember[];
  userId: string;
  isAdmin: boolean;
  adminCount: number;
  teamId: string;
  teamSlug: string;
};

/**
 * Extracted out of the members page (Phase 35) specifically to add the
 * mobile card view it never had — unlike VariablesList (Phase 25) and
 * AuditLogTable (Phase 30), this table went straight from Phase 15 to
 * Phase 34 as a single `overflow-x-auto` table with no dual-render split,
 * which meant horizontal scrolling instead of collapsing on a phone. Same
 * `min-[700px]:block`/`min-[700px]:hidden` convention as those two.
 */
export function MembersTable({ members, userId, isAdmin, adminCount, teamId, teamSlug }: MembersTableProps) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line min-[700px]:block">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <thead className="bg-card text-ink/50">
            <tr>
              <th scope="col" className={headingCellClass}>
                Member
              </th>
              <th scope="col" className={headingCellClass}>
                Email
              </th>
              <th scope="col" className={headingCellClass}>
                Role
              </th>
              <th scope="col" className={headingCellClass}>
                Joined
              </th>
              {isAdmin && (
                <th scope="col" className={headingCellClass}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {members.map((member) => {
              const isSelf = member.userId === userId;
              const isLastAdmin = member.role === "admin" && adminCount === 1;
              const memberLabel = member.displayName ?? member.email ?? "this member";

              return (
                <tr key={member.id} className="border-t border-line">
                  <td className={cellClass}>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-paper"
                      >
                        {member.initials}
                      </span>
                      <span className="truncate text-ink">
                        {member.displayName ?? "—"}
                        {isSelf && <span className="ml-2 text-xs text-ink/50">You</span>}
                      </span>
                    </div>
                  </td>

                  <td className={`${cellClass} text-ink/70`}>{member.email ?? "—"}</td>

                  <td className={cellClass}>
                    {isAdmin && !isLastAdmin ? (
                      <MemberRoleForm
                        memberId={member.id}
                        teamId={teamId}
                        teamSlug={teamSlug}
                        role={member.role}
                        memberLabel={memberLabel}
                      />
                    ) : (
                      <span className={badgeClass}>{ROLE_LABELS[member.role]}</span>
                    )}
                  </td>

                  <td className={`${cellClass} whitespace-nowrap text-ink/70`}>
                    {formatDate(member.joinedAt)}
                  </td>

                  {isAdmin && (
                    <td className={cellClass}>
                      {isLastAdmin ? (
                        <p className="text-xs text-ink/50">
                          This team&apos;s only admin. Make someone else an admin before changing
                          or removing this one.
                        </p>
                      ) : (
                        <RemoveMemberButton
                          memberId={member.id}
                          teamId={teamId}
                          teamSlug={teamSlug}
                          memberLabel={memberLabel}
                          isSelf={isSelf}
                        />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 min-[700px]:hidden">
        {members.map((member) => {
          const isSelf = member.userId === userId;
          const isLastAdmin = member.role === "admin" && adminCount === 1;
          const memberLabel = member.displayName ?? member.email ?? "this member";

          return (
            <li key={member.id} className="flex flex-col gap-3 rounded-lg border border-line bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-paper"
                >
                  {member.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {member.displayName ?? "—"}
                    {isSelf && <span className="ml-2 text-xs text-ink/50">You</span>}
                  </span>
                  <span className="block truncate text-xs text-ink/60">{member.email ?? "—"}</span>
                </span>
                {!(isAdmin && !isLastAdmin) && <span className={badgeClass}>{ROLE_LABELS[member.role]}</span>}
              </div>

              <p className="text-xs text-ink/50">Joined {formatDate(member.joinedAt)}</p>

              {isAdmin && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  {isLastAdmin ? (
                    <p className="text-xs text-ink/50">
                      This team&apos;s only admin. Make someone else an admin before changing or
                      removing this one.
                    </p>
                  ) : (
                    <>
                      <MemberRoleForm
                        memberId={member.id}
                        teamId={teamId}
                        teamSlug={teamSlug}
                        role={member.role}
                        memberLabel={memberLabel}
                      />
                      <RemoveMemberButton
                        memberId={member.id}
                        teamId={teamId}
                        teamSlug={teamSlug}
                        memberLabel={memberLabel}
                        isSelf={isSelf}
                      />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
