type TopBarProps = {
  isDrawerOpen: boolean;
  onMenuClick: () => void;
  breadcrumb: string[];
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function TopBar({ isDrawerOpen, onMenuClick, breadcrumb }: TopBarProps) {
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

      <form
        role="search"
        className="min-w-0 max-w-sm flex-1"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="shell-search" className="sr-only">
          Search
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input
            id="shell-search"
            type="search"
            placeholder="Search..."
            className={`w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink/40 ${focusRing}`}
          />
        </div>
      </form>

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

function SearchIcon({ className }: { className?: string }) {
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
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
