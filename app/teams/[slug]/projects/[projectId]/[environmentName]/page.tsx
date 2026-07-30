import Link from "next/link";
import { notFound } from "next/navigation";
import { AddEnvironmentForm } from "@/components/environments/AddEnvironmentForm";
import { DeleteEnvironmentButton } from "@/components/environments/DeleteEnvironmentButton";
import { EnvironmentTabs } from "@/components/environments/EnvironmentTabs";
import { RenameEnvironmentForm } from "@/components/environments/RenameEnvironmentForm";
import { AppShell } from "@/components/shell/AppShell";
import { getProjectEnvironments } from "@/lib/environments/queries";
import { environmentAccentVar, environmentPurpose } from "@/lib/environments/presentation";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getProject } from "@/lib/projects/queries";
import { getTeamAccess } from "@/lib/teams/queries";

export default async function ProjectEnvironmentPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; environmentName: string }>;
}) {
  const { slug, projectId, environmentName } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;

  const project = await getProject(projectId);
  // Same team-mismatch guard as the settings page — RLS already restricts
  // visibility to the caller's own teams, this just keeps the URL's team
  // slug and the project's actual team in agreement.
  if (!project || project.teamId !== team.id) notFound();

  const [sidebar, environments] = await Promise.all([
    getSidebarData(team.id),
    getProjectEnvironments(project.id),
  ]);

  // A stale or hand-edited URL (an environment that was since deleted, or
  // never existed) gets a plain 404 rather than silently falling back to
  // some default — the whole point of this phase is that which environment
  // you're looking at should never be ambiguous.
  const current = environments.find((env) => env.name === environmentName);
  if (!current) notFound();

  const canManageEnvironments = role !== "readonly";
  const purpose = environmentPurpose(current.name);

  return (
    <AppShell
      breadcrumb={[team.name, project.name, current.name]}
      sidebar={sidebar}
      envAccentVar={environmentAccentVar(current.name)}
    >
      <div className="flex flex-col gap-6">
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

        <EnvironmentTabs
          teamSlug={team.slug}
          projectId={project.id}
          environments={environments}
          activeName={current.name}
        />

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium capitalize text-ink">{current.name}</h2>
            {purpose && <p className="text-sm text-ink/60">{purpose}</p>}
          </div>

          <p className="text-sm text-ink/60">
            {current.variableCount} variable{current.variableCount === 1 ? "" : "s"}.
          </p>

          {/* Only non-default environments are editable at all — admin
              rights alone aren't enough, the Phase 18 triggers reject a
              rename/delete of a default regardless of role. */}
          {role === "admin" && !current.isDefault && (
            <div className="flex flex-wrap items-end gap-4">
              <RenameEnvironmentForm
                environmentId={current.id}
                projectId={project.id}
                teamId={team.id}
                teamSlug={team.slug}
                name={current.name}
              />
              <DeleteEnvironmentButton
                environmentId={current.id}
                projectId={project.id}
                teamId={team.id}
                teamSlug={team.slug}
                environmentName={current.name}
                variableCount={current.variableCount}
              />
            </div>
          )}
        </section>

        {/* Absent rather than disabled for readonly members — same pattern
            used throughout the members and projects screens. */}
        {canManageEnvironments && (
          <AddEnvironmentForm
            projectId={project.id}
            teamId={team.id}
            teamSlug={team.slug}
            currentEnvironmentName={current.name}
          />
        )}
      </div>
    </AppShell>
  );
}
