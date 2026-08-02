import { notFound } from "next/navigation";
import { InviteMemberForm } from "@/components/invites/InviteMemberForm";
import { RevokeInviteButton } from "@/components/invites/RevokeInviteButton";
import { AppShell } from "@/components/shell/AppShell";
import { MembersTable } from "@/components/teams/MembersTable";
import { describeExpiry, hasExpired } from "@/lib/format/expiry";
import { getPendingInvites } from "@/lib/invites/queries";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getTeamAccess, getTeamMembers } from "@/lib/teams/queries";
import { ROLE_LABELS } from "@/lib/teams/roles";

const badgeClass = "rounded-full border border-line bg-paper px-2 py-0.5 text-xs text-ink/70";

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

  const [members, pendingInvites, sidebar] = await Promise.all([
    getTeamMembers(team.id),
    getPendingInvites(team.id),
    getSidebarData(team.id),
  ]);

  // The team's last admin can't be demoted or removed — the trigger in the
  // Phase 15 migration is what actually enforces that; this is only what lets
  // the screen explain it instead of failing on submit.
  const adminCount = members.filter((member) => member.role === "admin").length;

  return (
    <AppShell breadcrumb={[team.name, "Members"]} sidebar={sidebar}>
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

          <MembersTable
            members={members}
            userId={userId}
            isAdmin={isAdmin}
            adminCount={adminCount}
            teamId={team.id}
            teamSlug={team.slug}
          />
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
                        teamId={team.id}
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
