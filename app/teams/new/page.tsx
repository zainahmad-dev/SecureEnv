import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";
import { getSidebarData } from "@/lib/shell/sidebar-data";

export const metadata: Metadata = { title: "Create a team" };

// Reached from the team switcher's "Create team" action. Unlike /onboarding
// (which exists only for a user with zero teams and redirects away the
// moment they have one), this page has to stay reachable for someone who
// already belongs to several teams — a freelancer or agency adding another
// client — so it does no such redirect.
export default async function NewTeamPage() {
  const sidebar = await getSidebarData();

  return (
    <AppShell breadcrumb={["Create team"]} sidebar={sidebar}>
      <div className="max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-ink">Create a team</h1>
        <p className="mb-6 text-sm text-ink/60">
          Each team is a separate, isolated workspace — handy for keeping different
          clients&apos; projects apart.
        </p>

        <CreateTeamForm />
      </div>
    </AppShell>
  );
}
