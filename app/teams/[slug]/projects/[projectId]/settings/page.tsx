import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { DeleteProjectSection } from "@/components/projects/DeleteProjectSection";
import { RenameProjectForm } from "@/components/projects/RenameProjectForm";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getProject } from "@/lib/projects/queries";
import { getTeamAccess } from "@/lib/teams/queries";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;

  const project = await getProject(projectId);
  if (!project || project.teamId !== team.id) notFound();

  const sidebar = await getSidebarData(team.id);

  return (
    <AppShell breadcrumb={[team.name, project.name, "Settings"]} sidebar={sidebar}>
      <div className="flex max-w-lg flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Project settings</h1>
          <p className="text-ink/60">{project.name}</p>
        </div>

        {role !== "admin" ? (
          <p className="text-sm text-ink/60">
            Only team admins can rename or delete this project.
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-medium text-ink">General</h2>
              <RenameProjectForm
                projectId={project.id}
                teamId={team.id}
                teamSlug={team.slug}
                name={project.name}
                description={project.description ?? ""}
              />
            </section>

            <DeleteProjectSection
              projectId={project.id}
              teamId={team.id}
              teamSlug={team.slug}
              projectName={project.name}
              variableCount={project.variableCount}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
