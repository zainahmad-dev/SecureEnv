"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { SearchResults } from "@/lib/search/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const EMPTY_RESULTS: SearchResults = { projects: [], variables: [] };

/**
 * Global search across the current team's project names and variable
 * *keys* — never values (see lib/search/queries.ts's own docstring for
 * why). Absent, not disabled, when there's no current team (onboarding,
 * team-less states) — same pattern the rest of the shell uses for
 * team-scoped UI.
 */
export function GlobalSearch({
  teamId,
  teamSlug,
}: {
  teamId: string | null;
  teamSlug: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [modLabel, setModLabel] = useState("Ctrl");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 200);

  // Set post-mount only, so server and first-paint client HTML match — the
  // shortcut itself checks both metaKey and ctrlKey regardless, this only
  // changes what the visible hint says.
  useEffect(() => {
    if (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) setModLabel("⌘");
  }, []);

  // Ctrl/Cmd+K focuses search from anywhere in the app, not just when the
  // shell is visible in the viewport.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!teamId || !debouncedQuery) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/search?teamId=${encodeURIComponent(teamId)}&q=${encodeURIComponent(debouncedQuery)}`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? (response.json() as Promise<SearchResults>) : EMPTY_RESULTS))
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults(EMPTY_RESULTS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, debouncedQuery]);

  if (!teamId || !teamSlug) {
    // Keeps TopBar's flex layout stable without rendering a search box that
    // has no team to search within.
    return <div className="min-w-0 max-w-sm flex-1" />;
  }

  const hasQuery = debouncedQuery.length > 0;
  const hasResults = results.projects.length > 0 || results.variables.length > 0;
  const showDropdown = open && hasQuery;

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-sm flex-1">
      <label htmlFor="shell-search" className="sr-only">
        Search
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        <input
          ref={inputRef}
          id="shell-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="shell-search-results"
          aria-autocomplete="list"
          className={`w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-14 text-sm text-ink placeholder:text-ink/40 ${focusRing}`}
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink/40"
        >
          {modLabel}K
        </kbd>
      </div>

      {showDropdown && (
        <div
          id="shell-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-paper shadow-lg"
        >
          {!hasResults ? (
            <p className="px-3 py-3 text-sm text-ink/50">
              {loading ? "Searching…" : `No matches for “${debouncedQuery}”.`}
            </p>
          ) : (
            <>
              {results.projects.length > 0 && (
                <div className="p-1">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Projects
                  </p>
                  <ul>
                    {results.projects.map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/teams/${teamSlug}/projects/${project.id}`}
                          onClick={() => setOpen(false)}
                          className={`block truncate rounded-md px-2 py-1.5 text-sm text-ink hover:bg-card ${focusRing}`}
                        >
                          {project.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results.variables.length > 0 && (
                <div className="border-t border-line p-1">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink/40">
                    Variables
                  </p>
                  <ul>
                    {results.variables.map((variable) => (
                      <li key={variable.id}>
                        <Link
                          href={`/teams/${teamSlug}/projects/${variable.projectId}/${variable.environmentName}`}
                          onClick={() => setOpen(false)}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card ${focusRing}`}
                        >
                          <code className="min-w-0 truncate font-mono text-ink">{variable.key}</code>
                          <span className="shrink-0 text-xs text-ink/40">
                            {variable.projectName} / {variable.environmentName}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
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
