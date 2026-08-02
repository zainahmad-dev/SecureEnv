"use client";

import { useActionState, useState } from "react";
import { SuggestionChecklist } from "@/components/ai/SuggestionChecklist";
import { generateSuggestions, type GenerateSuggestionsState } from "@/lib/ai/generator/actions";
import { NOTES_MAX_LENGTH, SERVICE_OPTIONS } from "@/lib/ai/generator/services";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: GenerateSuggestionsState = { status: "idle" };

type EnvGeneratorProps = {
  environmentId: string;
  projectId: string;
  teamId: string;
  teamSlug: string;
  environmentName: string;
  /** Keys already in this environment, so the checklist can mark them instead of letting the save fail on a duplicate. */
  existingKeys: string[];
};

export function EnvGenerator({ existingKeys, ...context }: EnvGeneratorProps) {
  const [state, formAction, isPending] = useActionState<GenerateSuggestionsState, FormData>(
    generateSuggestions,
    initialState,
  );
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  function toggleService(id: string) {
    setSelectedServices((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="teamId" value={context.teamId} />

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-ink">Which services does this use?</legend>

          <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[900px]:grid-cols-3">
            {SERVICE_OPTIONS.map((service) => {
              const checked = selectedServices.includes(service.id);
              return (
                <label
                  key={service.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors motion-reduce:transition-none ${
                    checked ? "border-accent bg-accent/5" : "border-line bg-paper hover:bg-card"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="services"
                    value={service.id}
                    checked={checked}
                    onChange={() => toggleService(service.id)}
                    className={`mt-0.5 size-4 shrink-0 accent-accent ${focusRing}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{service.label}</span>
                    <span className="block text-xs text-ink/55">{service.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="generator-notes" className="text-sm font-medium text-ink">
            Anything else? <span className="font-normal text-ink/50">(optional)</span>
          </label>
          <textarea
            id="generator-notes"
            name="notes"
            rows={3}
            maxLength={NOTES_MAX_LENGTH}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="We also use Redis for sessions and Sentry for error tracking."
            className={`w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`}
          />
          {/* Said before they type it, not after the request is refused —
              the guard in lib/ai/guard.ts will reject a pasted key, but a
              user who has already pasted one has already had it on their
              clipboard and in a form field. */}
          <p className="text-xs text-ink/55">
            Describe your stack in words. Never paste a real key or value here — SecureEnv only ever
            asks the AI for variable <em>names</em>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
          >
            {isPending
              ? "Asking…"
              : state.status === "ok"
                ? "Regenerate"
                : "Suggest variables"}
          </button>

          {isPending && (
            <span className="text-sm text-ink/60" role="status">
              Looking up the standard variables for these services…
            </span>
          )}
        </div>

        {/* The phase's "never a dead spinner" rule: a failed generation always
            ends in a sentence saying what happened, and — when trying the same
            request again could plausibly work — a button that does exactly
            that. `formAction` on a submit button re-posts this same form, so
            the user's service picks and notes are still attached; there is
            nothing to re-enter. */}
        {state.status === "error" && !isPending && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
          >
            <p>{state.error}</p>
            {state.retryable && (
              <button
                type="submit"
                className={`rounded-lg border border-danger/40 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10 ${focusRing}`}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </form>

      {state.status === "ok" && !isPending && (
        <SuggestionChecklist
          // Remounts on every fresh generation so a second run starts from a
          // clean checklist rather than carrying over ticks and half-typed
          // values that belonged to the previous list of keys.
          key={state.suggestions.map((suggestion) => suggestion.key).join("|")}
          suggestions={state.suggestions}
          existingKeys={existingKeys}
          {...context}
        />
      )}
    </div>
  );
}
