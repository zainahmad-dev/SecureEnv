import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CreateProjectForm } from "@/components/projects/CreateProjectForm";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getTeamAccess } from "@/lib/teams/queries";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;
  const sidebar = await getSidebarData(team.id);

  return (
    <AppShell breadcrumb={[team.name, "New project"]} sidebar={sidebar}>
      <div className="max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-ink">Create a project</h1>

        {role === "readonly" ? (
          <p className="text-sm text-ink/60">
            Only team admins and members can create projects. Ask an admin to add one.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-ink/60">
              A project holds its own environments and variables, scoped to {team.name}.
            </p>
            <CreateProjectForm teamId={team.id} teamSlug={team.slug} />
          </>
        )}
      </div>
    </AppShell>
  );
}
