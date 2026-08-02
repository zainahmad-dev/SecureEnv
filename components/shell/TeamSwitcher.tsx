"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ROLE_LABELS } from "@/lib/teams/roles";
import type { UserTeamSummary } from "@/lib/teams/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

// Below this many teams, a filter box is just another thing to click past —
// above it (the notes call out freelancers/agencies running one team per
// client), scrolling a bare list stops being usable and search earns its space.
const SEARCH_THRESHOLD = 6;

type TeamSwitcherProps = {
  teams: UserTeamSummary[];
  currentTeamId: string | null;
};

export function TeamSwitcher({ teams, currentTeamId }: TeamSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTeam = teams.find((team) => team.id === currentTeamId) ?? null;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Closing resets the filter — reopening later shouldn't show a stale search.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? teams.filter((team) => team.name.toLowerCase().includes(trimmedQuery))
    : teams;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-left text-sm font-medium text-ink ${focusRing}`}
      >
        <span className="truncate">{currentTeam?.name ?? "Select a team"}</span>
        <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-ink/40" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Teams"
          className="absolute left-0 right-0 z-50 mt-1 flex max-h-80 flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-lg"
        >
          {teams.length > SEARCH_THRESHOLD && (
            <div className="border-b border-line p-2">
              <label htmlFor="team-switcher-search" className="sr-only">
                Filter teams
              </label>
              <input
                id="team-switcher-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a team…"
                autoFocus
                className={`w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink placeholder:text-ink/40 ${focusRing}`}
              />
            </div>
          )}

          <ul className="flex-1 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink/50">
                {teams.length === 0
                  ? "You're not on any team yet. Create one below, or ask a teammate to invite you."
                  : `No teams match "${query.trim()}".`}
              </li>
            ) : (
              filtered.map((team) => {
                const isCurrent = team.id === currentTeamId;

                return (
                  <li key={team.id}>
                    <Link
                      href={`/teams/${team.slug}`}
                      onClick={() => setOpen(false)}
                      aria-current={isCurrent ? "true" : undefined}
                      className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-card ${focusRing} ${
                        isCurrent ? "text-ink" : "text-ink/80"
                      }`}
                    >
                      <span className="min-w-0 truncate">{team.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-ink/40">{ROLE_LABELS[team.role]}</span>
                        {isCurrent && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
                      </span>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-line p-1">
            <Link
              href="/teams/new"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-card ${focusRing}`}
            >
              <PlusIcon className="h-4 w-4 shrink-0" />
              Create team
            </Link>
          </div>
        </div>
      )}
    </div>
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

function CheckIcon({ className }: { className?: string }) {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
