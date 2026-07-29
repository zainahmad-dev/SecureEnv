import { notFound } from "next/navigation";
import { InviteMemberForm } from "@/components/invites/InviteMemberForm";
import { RevokeInviteButton } from "@/components/invites/RevokeInviteButton";
import { AppShell } from "@/components/shell/AppShell";
import { describeExpiry, hasExpired } from "@/lib/format/expiry";
import { getPendingInvites } from "@/lib/invites/queries";
import { getTeamAccess, getTeamMembers } from "@/lib/teams/queries";
import { ROLE_LABELS } from "@/lib/teams/roles";

const rowClass =
  "flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-4 py-3";

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

  const [members, pendingInvites] = await Promise.all([
    getTeamMembers(team.id),
    getPendingInvites(team.id),
  ]);

  return (
    <AppShell breadcrumb={[team.name, "Members"]}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Members</h1>
          <p className="text-ink/60">
            Who can reach {team.name}&apos;s projects, and what they&apos;re allowed to do.
          </p>
        </div>

        {/* Absent rather than disabled for non-admins: a disabled form
            advertises what someone is missing, an absent one just reads as a
            screen that isn't about them. Phase 15 applies the same rule to the
            role and remove controls. */}
        {isAdmin && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-ink">Invite someone</h2>
            <InviteMemberForm teamId={team.id} teamSlug={team.slug} />
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-ink">
            Members{" "}
            <span className="text-sm font-normal text-ink/50">({members.length})</span>
          </h2>

          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id} className={rowClass}>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-paper"
                >
                  {member.initials}
                </span>

                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {member.displayName ?? "Unnamed teammate"}
                  {member.userId === userId && (
                    <span className="ml-2 text-xs text-ink/50">You</span>
                  )}
                </span>

                <span className={badgeClass}>{ROLE_LABELS[member.role]}</span>
              </li>
            ))}
          </ul>
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
                  <li key={invite.id} className={rowClass}>
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
