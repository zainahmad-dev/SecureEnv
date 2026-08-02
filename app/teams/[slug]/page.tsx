import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/shell/AppShell";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getTeamAccess } from "@/lib/teams/queries";
import { ROLE_LABELS } from "@/lib/teams/roles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const access = await getTeamAccess(slug);
  return { title: access?.team.name ?? "Team" };
}

export default async function TeamDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Resolved through RLS — a slug that doesn't exist and a slug the user has
  // no access to are indistinguishable here on purpose, both just return null.
  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;
  const sidebar = await getSidebarData(team.id);

  return (
    <AppShell breadcrumb={[team.name]} sidebar={sidebar}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{team.name}</h1>
          <p className="text-ink/60">You&apos;re a {ROLE_LABELS[role].toLowerCase()} here.</p>
        </div>

        <div>
          <Link
            href={`/teams/${team.slug}/members`}
            className="font-medium text-accent hover:underline"
          >
            Members and invites
          </Link>
        </div>

        <LogoutButton />
      </div>
    </AppShell>
  );
}
