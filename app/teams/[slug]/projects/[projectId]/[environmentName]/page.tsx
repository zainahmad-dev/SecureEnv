import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/audit/ActivityFeed";
import { AddEnvironmentForm } from "@/components/environments/AddEnvironmentForm";
import { DeleteEnvironmentButton } from "@/components/environments/DeleteEnvironmentButton";
import { EnvironmentTabs } from "@/components/environments/EnvironmentTabs";
import { RenameEnvironmentForm } from "@/components/environments/RenameEnvironmentForm";
import { AppShell } from "@/components/shell/AppShell";
import { CreateVariableForm } from "@/components/variables/CreateVariableForm";
import { VariablesSection } from "@/components/variables/VariablesSection";
import { getProjectActivityFeed } from "@/lib/audit/queries";
import { getProjectEnvironments } from "@/lib/environments/queries";
import { environmentAccentVar, environmentPurpose } from "@/lib/environments/presentation";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getProject } from "@/lib/projects/queries";
import { getTeamAccess } from "@/lib/teams/queries";
import { getEnvironmentVariables } from "@/lib/variables/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; environmentName: string }>;
}): Promise<Metadata> {
  const { projectId, environmentName } = await params;
  const project = await getProject(projectId);
  const capitalized = environmentName.charAt(0).toUpperCase() + environmentName.slice(1);
  return { title: project ? `${capitalized} · ${project.name}` : capitalized };
}

export default async function ProjectEnvironmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectId: string; environmentName: string }>;
  searchParams: Promise<{ highlight?: string }>;
}) {
  const { slug, projectId, environmentName } = await params;
  // Set by the scanner's "Fix" action (Phase 41) — the variable key to
  // scroll to and highlight in the list below. Undefined on every ordinary
  // visit to this page.
  const { highlight: highlightKey } = await searchParams;

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

  const [variables, activity] = await Promise.all([
    getEnvironmentVariables(current.id),
    getProjectActivityFeed(
      team.id,
      project.id,
      environments.map((env) => env.id),
    ),
  ]);

  const canManageEnvironments = role !== "readonly";
  // Same gate as canManageEnvironments (RLS's "member" minimum for
  // variables and environments alike), named separately since they're
  // different actions that just happen to share a role threshold. Now
  // covers create, edit, and delete — Phase 27 widened it, RLS already
  // used the same "member" threshold for all three from the start.
  const canManageVariables = role !== "readonly";
  const purpose = environmentPurpose(current.name);

  return (
    <AppShell
      breadcrumb={[team.name, project.name, current.name]}
      sidebar={sidebar}
      envAccentVar={environmentAccentVar(current.name)}
    >
      {/* Right-hand column on wide screens, stacked below on narrow ones
          (Phase 31) — `min-[1024px]` follows this file's own `min-[900px]`/
          `min-[700px]` arbitrary-variant convention rather than introducing
          Tailwind's default `lg:` alongside it. `items-start` keeps the
          activity panel from stretching to the (usually much taller) main
          column's height. */}
      <div className="grid grid-cols-1 gap-6 min-[1024px]:grid-cols-[minmax(0,1fr)_18rem] min-[1024px]:items-start">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
              {project.description && (
                <p className="mt-1 max-w-2xl text-ink/60">{project.description}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Visible to every role, unlike Settings below — a readonly
                  member can already see whatever the last scan found
                  (Phase 11's own SELECT policy on security_scans only
                  requires readonly), so hiding this entry point would just
                  make that score harder to find, not restrict anything. */}
              <Link
                href={`/teams/${team.slug}/projects/${project.id}/scanner`}
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
              >
                Security scan
              </Link>

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

          <VariablesSection
            variables={variables}
            environmentId={current.id}
            projectId={project.id}
            teamId={team.id}
            teamSlug={team.slug}
            environmentName={current.name}
            canManageVariables={canManageVariables}
            highlightKey={highlightKey}
          />

          {/* Absent rather than disabled for readonly members. Reveal
              (Phase 26) and edit/delete (Phase 27) live inside VariablesList's
              own row structure, not here. */}
          {canManageVariables && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-medium text-ink">Add a variable</h2>

                {/* Phase 38's generator, reached from the place someone is
                    already standing when they realise they don't know what a
                    service's variables are called. */}
                <Link
                  href={`/teams/${team.slug}/projects/${project.id}/${current.name}/generate`}
                  className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
                >
                  Not sure what you need?
                </Link>
              </div>
              <CreateVariableForm
                environmentId={current.id}
                projectId={project.id}
                teamId={team.id}
                teamSlug={team.slug}
                environmentName={current.name}
              />
            </section>
          )}

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

        <ActivityFeed rows={activity} teamSlug={team.slug} />
      </div>
    </AppShell>
  );
}
