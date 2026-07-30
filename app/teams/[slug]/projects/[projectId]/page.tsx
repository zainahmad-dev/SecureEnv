import Link from "next/link";
import { notFound } from "next/navigation";
import { AddEnvironmentForm } from "@/components/environments/AddEnvironmentForm";
import { DeleteEnvironmentButton } from "@/components/environments/DeleteEnvironmentButton";
import { RenameEnvironmentForm } from "@/components/environments/RenameEnvironmentForm";
import { AppShell } from "@/components/shell/AppShell";
import { getProjectEnvironments } from "@/lib/environments/queries";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getProject } from "@/lib/projects/queries";
import { getTeamAccess } from "@/lib/teams/queries";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;

  const project = await getProject(projectId);
  // A project id that resolves under a different team (both teams the same
  // user belongs to) would otherwise render under the wrong breadcrumb — RLS
  // already restricts visibility to the caller's own teams, this just makes
  // sure the URL's team slug and the project's actual team agree.
  if (!project || project.teamId !== team.id) notFound();

  const [sidebar, environments] = await Promise.all([
    getSidebarData(team.id),
    getProjectEnvironments(project.id),
  ]);

  const canManageEnvironments = role !== "readonly";

  return (
    <AppShell breadcrumb={[team.name, project.name]} sidebar={sidebar}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
            {project.description && (
              <p className="mt-1 max-w-2xl text-ink/60">{project.description}</p>
            )}
          </div>

          {/* Absent rather than disabled for non-admins — same pattern as the
              members screen's action column. */}
          {role === "admin" && (
            <Link
              href={`/teams/${team.slug}/projects/${project.id}/settings`}
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
            >
              Settings
            </Link>
          )}
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-ink">
            Environments{" "}
            <span className="text-sm font-normal text-ink/50">({environments.length})</span>
          </h2>

          <ul className="flex flex-col gap-2">
            {environments.map((env) => (
              <li
                key={env.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-4 py-3"
              >
                {/* Only non-default environments are editable at all — admin
                    rights alone aren't enough, the Phase 18 triggers reject
                    a rename/delete of a default regardless of role. */}
                {role === "admin" && !env.isDefault ? (
                  <RenameEnvironmentForm
                    environmentId={env.id}
                    projectId={project.id}
                    teamId={team.id}
                    teamSlug={team.slug}
                    name={env.name}
                  />
                ) : (
                  <span className="text-sm font-medium capitalize text-ink">{env.name}</span>
                )}

                <span className="flex items-center gap-3">
                  <span className="text-xs text-ink/50">
                    {env.variableCount} variable{env.variableCount === 1 ? "" : "s"}
                  </span>

                  {role === "admin" && !env.isDefault && (
                    <DeleteEnvironmentButton
                      environmentId={env.id}
                      projectId={project.id}
                      teamId={team.id}
                      teamSlug={team.slug}
                      environmentName={env.name}
                      variableCount={env.variableCount}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* Absent rather than disabled for readonly members — same pattern
              used throughout the members and projects screens. */}
          {canManageEnvironments && (
            <AddEnvironmentForm projectId={project.id} teamId={team.id} teamSlug={team.slug} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
