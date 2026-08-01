"use client";

import { useMemo, useState } from "react";
import { VariablesList } from "@/components/variables/VariablesList";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { VariableSummary } from "@/lib/variables/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

type VariablesSectionProps = {
  variables: VariableSummary[];
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  canManageVariables: boolean;
};

/**
 * Owns the Phase 33 "filter by key, debounced" search box — a client
 * component wrapping the otherwise-server-rendered VariablesList, since
 * filtering needs local input state the environment page (a Server
 * Component) can't hold itself. Never touches values: `variables` here is
 * already the same key/description/metadata-only VariableSummary[] the
 * page always fetched, nothing new is decrypted or requested to support
 * filtering.
 */
export function VariablesSection({
  variables,
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
  canManageVariables,
}: VariablesSectionProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 150);
  const isFiltering = debouncedQuery.length > 0;

  const filtered = useMemo(() => {
    if (!isFiltering) return variables;
    const needle = debouncedQuery.toLowerCase();
    return variables.filter((variable) => variable.key.toLowerCase().includes(needle));
  }, [variables, debouncedQuery, isFiltering]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-ink">
          Variables{" "}
          <span className="text-sm font-normal text-ink/50">
            {isFiltering ? `(${filtered.length} of ${variables.length})` : `(${variables.length})`}
          </span>
        </h2>

        {/* Only shown once there's something to filter — an environment
            with zero variables gets its own "nothing here yet" empty state
            below, never a search box with nothing behind it. */}
        {variables.length > 0 && (
          <div className="relative w-full max-w-[16rem]">
            <label htmlFor="variable-key-filter" className="sr-only">
              Filter by key
            </label>
            <input
              id="variable-key-filter"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by key…"
              className={`w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink/40 ${focusRing}`}
            />
          </div>
        )}
      </div>

      {/* Distinct from VariablesList's own "no variables in this
          environment yet" — this one only ever appears when there IS at
          least one variable but the filter matched none of them. */}
      {isFiltering && filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-center">
          <p className="text-sm text-ink/60">No variables match “{debouncedQuery}”.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className={`mt-1 text-sm text-accent underline decoration-dotted ${focusRing}`}
          >
            Clear filter
          </button>
        </div>
      ) : (
        <VariablesList
          variables={filtered}
          environmentId={environmentId}
          projectId={projectId}
          teamId={teamId}
          teamSlug={teamSlug}
          environmentName={environmentName}
          canManageVariables={canManageVariables}
        />
      )}
    </section>
  );
}
