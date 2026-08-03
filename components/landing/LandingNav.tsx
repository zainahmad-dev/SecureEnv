import Link from "next/link";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { GITHUB_URL, PORTFOLIO_URL } from "@/lib/site";

/**
 * The landing page's own header. Deliberately not AppShell — that shell
 * exists to orient someone *inside* a workspace (team switcher, projects,
 * audit log), none of which means anything to a visitor who hasn't signed
 * in and may never.
 *
 * Reuses ThemeToggle unchanged: it's already self-contained (its own
 * localStorage read, its own pre-mount placeholder), so dark mode on this
 * page needed no new code at all.
 */
export function LandingNav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 min-[900px]:px-8">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-paper"
          >
            SE
          </span>
          <span className="font-semibold text-ink">SecureEnv</span>
        </span>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-ink/70 hover:text-ink"
          >
            GitHub
          </a>

          {/* Rendered only when configured — see lib/site.ts for why a
              guessed portfolio URL would be worse than none. */}
          {PORTFOLIO_URL && (
            <a
              href={PORTFOLIO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink/70 hover:text-ink"
            >
              Portfolio
            </a>
          )}

          <ThemeToggle />

          <Link
            href={isSignedIn ? "/dashboard" : "/login"}
            className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card"
          >
            {isSignedIn ? "Open dashboard" : "Log in"}
          </Link>
        </div>
      </nav>
    </header>
  );
}
