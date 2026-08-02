"use client";

import { useActionState, useMemo, useState } from "react";
import type { SuggestedVariable } from "@/lib/ai/generator/schema";
import { ENTRY_ANIMATION_CLASS, entryAnimationStyle } from "@/lib/ui/entry-animation";
import { addGeneratedVariables, type AddGeneratedVariablesState } from "@/lib/variables/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-ink/40 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

const initialState: AddGeneratedVariablesState = { error: null };

type SuggestionChecklistProps = {
  suggestions: SuggestedVariable[];
  existingKeys: string[];
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
};

export function SuggestionChecklist({
  suggestions,
  existingKeys,
  environmentId,
  projectId,
  teamId,
  teamSlug,
  environmentName,
}: SuggestionChecklistProps) {
  const [state, formAction, isPending] = useActionState<AddGeneratedVariablesState, FormData>(
    addGeneratedVariables,
    initialState,
  );

  const existing = useMemo(() => new Set(existingKeys), [existingKeys]);
  const addable = useMemo(
    () => suggestions.filter((suggestion) => !existing.has(suggestion.key)),
    [suggestions, existing],
  );

  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Grouped by the service each variable came from, first-seen order — a
  // flat list of fifteen keys from three vendors is much harder to work
  // through than three short ones. This is the only thing `service` is for.
  const groups = useMemo(() => {
    const byService = new Map<string, SuggestedVariable[]>();
    for (const suggestion of suggestions) {
      const label = suggestion.service || "Other";
      const group = byService.get(label);
      if (group) group.push(suggestion);
      else byService.set(label, [suggestion]);
    }
    return [...byService.entries()];
  }, [suggestions]);

  function toggle(key: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allSelected = addable.length > 0 && checked.size === addable.length;

  let rowIndex = 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="environmentId" value={environmentId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="teamSlug" value={teamSlug} />
      <input type="hidden" name="environmentName" value={environmentName} />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">
            Suggested variables{" "}
            <span className="text-sm font-normal text-ink/50">({suggestions.length})</span>
          </h2>
          <p className="text-sm text-ink/60">
            Tick the ones you want, then fill in the values yourself. These are names only — nothing
            here came with a value.
          </p>
        </div>

        {addable.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setChecked(
                allSelected ? new Set() : new Set(addable.map((suggestion) => suggestion.key)),
              )
            }
            className={`rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-card ${focusRing}`}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {groups.map(([service, rows]) => (
          <section key={service} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink/70">{service}</h3>

            <ul className="flex flex-col gap-2">
              {rows.map((suggestion) => {
                const alreadyAdded = existing.has(suggestion.key);
                const isChecked = checked.has(suggestion.key);
                const index = rowIndex++;

                return (
                  <li
                    key={suggestion.key}
                    className={`rounded-lg border p-3 ${ENTRY_ANIMATION_CLASS} ${
                      alreadyAdded
                        ? "border-line bg-card/40"
                        : isChecked
                          ? "border-accent bg-accent/5"
                          : "border-line bg-paper"
                    }`}
                    style={entryAnimationStyle(index)}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        id={`suggestion-${suggestion.key}`}
                        type="checkbox"
                        name="selected"
                        value={suggestion.key}
                        checked={isChecked}
                        disabled={alreadyAdded}
                        onChange={() => toggle(suggestion.key)}
                        className={`mt-1 size-4 shrink-0 accent-accent disabled:opacity-40 ${focusRing}`}
                      />

                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={`suggestion-${suggestion.key}`}
                            className="font-mono text-sm text-ink"
                          >
                            {suggestion.key}
                          </label>

                          {suggestion.visibility === "public" ? (
                            <span className="rounded-full border border-line px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-ink/60">
                              Public
                            </span>
                          ) : (
                            <span className="rounded-full border border-danger/30 px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-danger">
                              Secret
                            </span>
                          )}

                          {alreadyAdded && (
                            <span className="text-xs text-ink/55">Already in this environment</span>
                          )}
                        </div>

                        {suggestion.description && (
                          <p className="text-sm text-ink/60">{suggestion.description}</p>
                        )}

                        {!alreadyAdded && (
                          <div className="flex flex-col gap-2 min-[700px]:flex-row">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <label
                                htmlFor={`value-${suggestion.key}`}
                                className="text-xs font-medium text-ink/70"
                              >
                                Value
                              </label>
                              {/* Disabled until the row is ticked, which is
                                  not only a UI nicety: a disabled input is
                                  not submitted, so a value typed into a row
                                  the user then unticked never leaves the
                                  browser at all. */}
                              <input
                                id={`value-${suggestion.key}`}
                                name={`value:${suggestion.key}`}
                                // A NEXT_PUBLIC_ value is inlined into the
                                // browser bundle by definition, so masking it
                                // here would be theatre; everything else gets
                                // the same treatment as the normal add form.
                                type={suggestion.visibility === "public" ? "text" : "password"}
                                autoComplete="off"
                                required={isChecked}
                                disabled={!isChecked}
                                placeholder={
                                  suggestion.visibility === "public" ? "https://…" : "••••••••"
                                }
                                className={`${fieldClass} font-mono`}
                              />
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <label
                                htmlFor={`description-${suggestion.key}`}
                                className="text-xs font-medium text-ink/70"
                              >
                                Description
                              </label>
                              <input
                                id={`description-${suggestion.key}`}
                                name={`description:${suggestion.key}`}
                                type="text"
                                maxLength={500}
                                defaultValue={suggestion.description}
                                disabled={!isChecked}
                                className={fieldClass}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending || checked.size === 0}
          className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
        >
          {isPending
            ? "Saving…"
            : checked.size === 0
              ? "Add to environment"
              : `Add ${checked.size} to ${environmentName}`}
        </button>

        <p className="text-xs text-ink/55">
          Saved through the same encryption path as any other variable — values are encrypted before
          they reach the database.
        </p>
      </div>
    </form>
  );
}
