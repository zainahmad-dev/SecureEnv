"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { SearchResults } from "@/lib/search/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const EMPTY_RESULTS: SearchResults = { projects: [], variables: [] };

const optionId = (index: number) => `search-option-${index}`;

type FlatResult = { id: string; href: string };

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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [modLabel, setModLabel] = useState("Ctrl");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 200);

  // Flat, index-addressable view of the same two groups rendered below —
  // what aria-activedescendant and arrow-key navigation move through.
  const flatResults: FlatResult[] = [
    ...results.projects.map((project) => ({ id: project.id, href: `/teams/${teamSlug}/projects/${project.id}` })),
    ...results.variables.map((variable) => ({
      id: variable.id,
      href: `/teams/${teamSlug}/projects/${variable.projectId}/${variable.environmentName}`,
    })),
  ];

  // A fresh result set (new query, or new data for the same query)
  // shouldn't keep a stale highlight from the previous list.
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

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
      // Compared rather than lowercased, matching every other key check in
      // this file. `event.key` is typed non-nullable, but this listener is on
      // the bare document and fires for anything that dispatches a "keydown"
      // — a browser extension or an automation tool dispatching a plain
      // Event (not a real KeyboardEvent) has no `key` at all, and the
      // previous `event.key.toLowerCase()` threw a TypeError on it, killing
      // the handler. "k" and "K" are the only two values this ever needed.
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
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

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || flatResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, flatResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flatResults.length - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      setOpen(false);
      router.push(flatResults[activeIndex].href);
    }
  }

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
          onKeyDown={onInputKeyDown}
          placeholder="Search…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="shell-search-results"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
                <div role="group" aria-labelledby="search-group-projects" className="p-1">
                  <p
                    id="search-group-projects"
                    className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink/40"
                  >
                    Projects
                  </p>
                  <ul>
                    {results.projects.map((project, index) => (
                      <li key={project.id}>
                        <Link
                          id={optionId(index)}
                          role="option"
                          aria-selected={activeIndex === index}
                          href={`/teams/${teamSlug}/projects/${project.id}`}
                          onClick={() => setOpen(false)}
                          onMouseEnter={() => setActiveIndex(index)}
                          className={`block truncate rounded-md px-2 py-1.5 text-sm text-ink hover:bg-card ${focusRing} ${
                            activeIndex === index ? "bg-card" : ""
                          }`}
                        >
                          {project.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results.variables.length > 0 && (
                <div role="group" aria-labelledby="search-group-variables" className="border-t border-line p-1">
                  <p
                    id="search-group-variables"
                    className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink/40"
                  >
                    Variables
                  </p>
                  <ul>
                    {results.variables.map((variable, index) => {
                      // Variables are the second flat group, offset by however
                      // many project results preceded them — see flatResults above.
                      const flatIndex = results.projects.length + index;
                      return (
                        <li key={variable.id}>
                          <Link
                            id={optionId(flatIndex)}
                            role="option"
                            aria-selected={activeIndex === flatIndex}
                            href={`/teams/${teamSlug}/projects/${variable.projectId}/${variable.environmentName}`}
                            onClick={() => setOpen(false)}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-card ${focusRing} ${
                              activeIndex === flatIndex ? "bg-card" : ""
                            }`}
                          >
                            <code className="min-w-0 truncate font-mono text-ink">{variable.key}</code>
                            <span className="shrink-0 text-xs text-ink/40">
                              {variable.projectName} / {variable.environmentName}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
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
