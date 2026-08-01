import { GlobalSearch } from "@/components/shell/GlobalSearch";

type TopBarProps = {
  isDrawerOpen: boolean;
  onMenuClick: () => void;
  breadcrumb: string[];
  teamId: string | null;
  teamSlug: string | null;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function TopBar({ isDrawerOpen, onMenuClick, breadcrumb, teamId, teamSlug }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-paper px-4 min-[900px]:px-8">
      <button
        type="button"
        aria-expanded={isDrawerOpen}
        aria-controls="app-sidebar"
        onClick={onMenuClick}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-card min-[900px]:hidden ${focusRing}`}
      >
        <span className="sr-only">Toggle sidebar</span>
        <MenuIcon className="h-5 w-5" />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {breadcrumb.map((crumb, index) => (
            <li key={crumb} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-ink/30">
                  /
                </span>
              )}
              <span
                className={`truncate ${
                  index === breadcrumb.length - 1 ? "font-medium text-ink" : "text-ink/60"
                }`}
              >
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <GlobalSearch teamId={teamId} teamSlug={teamSlug} />

      <div aria-hidden="true" className="flex-1" />
    </header>
  );
}

function MenuIcon({ className }: { className?: string }) {
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
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}
