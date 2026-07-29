import { notFound } from "next/navigation";
import { InviteMemberForm } from "@/components/invites/InviteMemberForm";
import { RevokeInviteButton } from "@/components/invites/RevokeInviteButton";
import { AppShell } from "@/components/shell/AppShell";
import { MemberRoleForm } from "@/components/teams/MemberRoleForm";
import { RemoveMemberButton } from "@/components/teams/RemoveMemberButton";
import { formatDate } from "@/lib/format/date";
import { describeExpiry, hasExpired } from "@/lib/format/expiry";
import { getPendingInvites } from "@/lib/invites/queries";
import { getTeamAccess, getTeamMembers } from "@/lib/teams/queries";
import { ROLE_LABELS } from "@/lib/teams/roles";

const badgeClass = "rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-ink/70";

const cellClass = "px-3 py-3 align-middle";

const headingCellClass = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide";

export default async function TeamMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, userId, role } = access;
  const isAdmin = role === "admin";

  const [members, pendingInvites] = await Promise.all([
    getTeamMembers(team.id),
    getPendingInvites(team.id),
  ]);

  // The team's last admin can't be demoted or removed — the trigger in the
  // Phase 15 migration is what actually enforces that; this is only what lets
  // the screen explain it instead of failing on submit.
  const adminCount = members.filter((member) => member.role === "admin").length;

  return (
    <AppShell breadcrumb={[team.name, "Members"]}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Members</h1>
          <p className="text-ink/60">
            Who can reach {team.name}&apos;s projects, and what they&apos;re allowed to do.
          </p>
        </div>

        {/* Absent rather than disabled for non-admins, here and in every row
            below: a disabled control tells a readonly member exactly what
            they're missing, an absent one just reads as a clean screen. */}
        {isAdmin && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-ink">Invite someone</h2>
            <InviteMemberForm teamId={team.id} teamSlug={team.slug} />
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-ink">
            Members <span className="text-sm font-normal text-ink/50">({members.length})</span>
          </h2>

          <div className="overflow-x-auto rounded-lg border border-line">
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
                            teamId={team.id}
                            teamSlug={team.slug}
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
                              This team&apos;s only admin. Make someone else an admin before
                              changing or removing this one.
                            </p>
                          ) : (
                            <RemoveMemberButton
                              memberId={member.id}
                              teamId={team.id}
                              teamSlug={team.slug}
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
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-ink">
            Pending invites{" "}
            <span className="text-sm font-normal text-ink/50">({pendingInvites.length})</span>
          </h2>

          {pendingInvites.length === 0 ? (
            <p className="text-sm text-ink/60">No invitations are waiting to be accepted.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendingInvites.map((invite) => {
                const expired = hasExpired(invite.expires_at);

                return (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {invite.email}
                      <span
                        className={`ml-2 text-xs ${expired ? "text-danger" : "text-ink/50"}`}
                      >
                        {describeExpiry(invite.expires_at)}
                      </span>
                    </span>

                    <span className={badgeClass}>{ROLE_LABELS[invite.role]}</span>

                    {isAdmin && (
                      <RevokeInviteButton
                        inviteId={invite.id}
                        teamSlug={team.slug}
                        email={invite.email}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
