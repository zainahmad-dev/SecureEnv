import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { AcceptInviteForm } from "@/components/invites/AcceptInviteForm";
import { getCurrentUser } from "@/lib/auth/session";
import { describeExpiry } from "@/lib/format/expiry";
import { getInvitePreview, type InvitePreview } from "@/lib/invites/queries";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/teams/roles";

const linkClass = "font-medium text-accent hover:underline";

const INVALID_COPY = {
  title: "This invite link isn't valid",
  body: "Check that you copied the whole link. If it still doesn't work, ask the team admin to send a new one.",
};

const UNUSABLE: Partial<Record<InvitePreview["status"], { title: string; body: string }>> = {
  invalid: INVALID_COPY,
  expired: {
    title: "This invite has expired",
    body: "Invite links are good for 7 days. Ask the team admin to send a new one.",
  },
  revoked: {
    title: "This invite was revoked",
    body: "A team admin cancelled this invitation. Ask them to send a new one if you still need access.",
  },
  used: {
    title: "This invite has already been used",
    body: "Each invite link works once. If that wasn't you, tell the team admin.",
  },
};

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvitePreview(token);

  // email/role are only null on a status this branch already covers, but they
  // are checked rather than asserted — a null slipping through would otherwise
  // render an invitation to nowhere.
  if (invite.status !== "valid" || !invite.email || !invite.role) {
    const copy = UNUSABLE[invite.status] ?? INVALID_COPY;

    return (
      <>
        <h1 className="mb-1 text-xl font-semibold text-ink">{copy.title}</h1>
        <p className="mb-6 text-sm text-ink/60">{copy.body}</p>
        <Link href="/dashboard" className={linkClass}>
          Go to SecureEnv
        </Link>
      </>
    );
  }

  const teamName = invite.team_name ?? "a team";
  const next = `/invite/${token}`;
  const nextParam = `next=${encodeURIComponent(next)}`;
  const user = await getCurrentUser();

  const summary = (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Join {teamName}</h1>
      <p className="mb-6 text-sm text-ink/60">
        You&apos;ve been invited to {teamName} on SecureEnv as{" "}
        <span className="font-medium text-ink">{ROLE_LABELS[invite.role]}</span> —{" "}
        {ROLE_DESCRIPTIONS[invite.role]}.
      </p>
    </>
  );

  // Not signed in: the common case for a new team, and the one that has to
  // work without an account existing yet. Sign-up carries ?next back here, so
  // the round trip ends on this page with a session — whether that's immediate
  // or after an email confirmation.
  if (!user) {
    return (
      <>
        {summary}

        <p className="mb-4 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink/70">
          Create an account for <span className="font-medium text-ink">{invite.email}</span> to
          accept. {invite.expires_at ? describeExpiry(invite.expires_at) + "." : ""}
        </p>

        <SignupForm next={next} email={invite.email} emailLocked />

        <p className="mt-6 text-center text-sm text-ink/60">
          Already have an account?{" "}
          <Link href={`/login?${nextParam}`} className={linkClass}>
            Log in
          </Link>
        </p>
      </>
    );
  }

  // Signed in as someone else. The server-side check in accept_team_invite()
  // would reject this anyway; saying so here means the person isn't left
  // guessing why the button failed.
  if ((user.email ?? "").toLowerCase() !== invite.email) {
    return (
      <>
        {summary}

        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          This invitation was sent to {invite.email}, but you&apos;re signed in as{" "}
          {user.email}.
        </p>

        <p className="text-sm text-ink/60">
          <Link href={`/login?${nextParam}`} className={linkClass}>
            Sign in as {invite.email}
          </Link>{" "}
          to accept it, or{" "}
          <Link href={`/signup?${nextParam}`} className={linkClass}>
            create that account
          </Link>{" "}
          if you don&apos;t have one yet.
        </p>
      </>
    );
  }

  return (
    <>
      {summary}

      <p className="mb-4 text-sm text-ink/60">
        Accepting as <span className="font-medium text-ink">{user.email}</span>.{" "}
        {invite.expires_at ? describeExpiry(invite.expires_at) + "." : ""}
      </p>

      <AcceptInviteForm token={token} teamName={teamName} />
    </>
  );
}
