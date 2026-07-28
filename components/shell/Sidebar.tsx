type SidebarProps = {
  isOpen: boolean;
};

const workspace = { name: "Acme Inc" };

const projects = [
  { id: "1", name: "Website" },
  { id: "2", name: "Mobile App" },
  { id: "3", name: "Internal Tools" },
];

const teamLinks = [
  { label: "Members", href: "#" },
  { label: "Audit log", href: "#" },
  { label: "Settings", href: "#" },
];

const user = { initials: "JR", name: "Jamie Rivera", email: "jamie@acme.dev" };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function Sidebar({ isOpen }: SidebarProps) {
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
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-left text-sm font-medium text-ink ${focusRing}`}
          >
            <span className="truncate">{workspace.name}</span>
            <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-ink/40" />
          </button>
        </section>

        <nav aria-label="Projects" className="mb-6">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Projects
          </p>
          <ul className="space-y-1">
            {projects.map((project) => (
              <li key={project.id}>
                <a
                  href="#"
                  className={`block truncate rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-card ${focusRing}`}
                >
                  {project.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Team">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Team
          </p>
          <ul className="space-y-1">
            {teamLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className={`block rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-card ${focusRing}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line px-4 py-3">
        <a href="#" className={`flex items-center gap-3 rounded-lg p-1 ${focusRing}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-xs font-medium text-ink">
            {user.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-xs text-ink/50">{user.email}</span>
          </span>
        </a>
      </div>
    </aside>
  );
}

function ChevronsUpDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="7 15 12 20 17 15" />
      <polyline points="7 9 12 4 17 9" />
    </svg>
  );
}
