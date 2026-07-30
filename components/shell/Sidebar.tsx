import Link from "next/link";
import { TeamSwitcher } from "@/components/shell/TeamSwitcher";
import type { SidebarData } from "@/lib/shell/sidebar-data";

type SidebarProps = {
  isOpen: boolean;
  data: SidebarData;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function Sidebar({ isOpen, data }: SidebarProps) {
  const { teams, currentTeamId, projects, profile } = data;
  const currentTeam = teams.find((team) => team.id === currentTeamId) ?? null;
  // Readonly members can view projects but not create them — the role
  // already comes back with getUserTeams(), no extra query needed.
  const canCreateProject = currentTeam !== null && currentTeam.role !== "readonly";

  return (
    <aside
      id="app-sidebar"
      aria-label="Sidebar"
      className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-paper transition-transform duration-200 ease-in-out motion-reduce:transition-none min-[900px]:static min-[900px]:z-auto min-[900px]:w-64 min-[900px]:shrink-0 min-[900px]:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-paper">
          SE
        </span>
        <span className="text-base font-semibold text-ink">SecureEnv</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <section aria-label="Workspace" className="mb-6">
          <TeamSwitcher teams={teams} currentTeamId={currentTeamId} />
        </section>

        <nav aria-label="Projects" className="mb-6">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Projects</p>
            {currentTeam && canCreateProject && (
              <Link
                href={`/teams/${currentTeam.slug}/projects/new`}
                aria-label="New project"
                className={`rounded-md px-1.5 py-0.5 text-sm font-medium text-ink/50 hover:bg-card hover:text-ink ${focusRing}`}
              >
                +
              </Link>
            )}
          </div>

          {!currentTeam ? (
            <p className="px-2 text-sm text-ink/50">Select a team to see its projects.</p>
          ) : projects.length === 0 ? (
            <p className="px-2 text-sm text-ink/50">No projects yet.</p>
          ) : (
            <ul className="space-y-1">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/teams/${currentTeam.slug}/projects/${project.id}`}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-card ${focusRing}`}
                  >
                    <span className="truncate">{project.name}</span>
                    <span className="shrink-0 text-xs text-ink/40">{project.variableCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {currentTeam && (
          <nav aria-label="Team">
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
              Team
            </p>
            <ul className="space-y-1">
              <li>
                <Link
                  href={`/teams/${currentTeam.slug}/members`}
                  className={`block rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-card ${focusRing}`}
                >
                  Members
                </Link>
              </li>
              <li>
                <a
                  href="#"
                  className={`block rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-card ${focusRing}`}
                >
                  Audit log
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className={`block rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-card ${focusRing}`}
                >
                  Settings
                </a>
              </li>
            </ul>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-xs font-medium text-ink"
        >
          {profile.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {profile.displayName ?? profile.email}
          </span>
          {profile.displayName && (
            <span className="block truncate text-xs text-ink/50">{profile.email}</span>
          )}
        </span>
      </div>
    </aside>
  );
}
