import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
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

  const sidebar = await getSidebarData(team.id);

  return (
    <AppShell breadcrumb={[team.name, project.name]} sidebar={sidebar}>
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

        <p className="text-sm text-ink/60">
          {project.variableCount} variable{project.variableCount === 1 ? "" : "s"} across all
          environments.
        </p>
      </div>
    </AppShell>
  );
}
