"use client";

import { useActionState, useState } from "react";
import { FindingsList } from "@/components/scanner/FindingsList";
import { PostureMeter } from "@/components/scanner/PostureMeter";
import { ScoreSparkline } from "@/components/scanner/ScoreSparkline";
import { environmentAccentClasses } from "@/lib/environments/presentation";
import { runScan, type RunScanState } from "@/lib/scanner/actions";
import type { EnvironmentPosture } from "@/lib/scanner/history";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: RunScanState = { status: "idle" };

/**
 * The demo screen (Phase 41's own note). A local tab strip — not
 * EnvironmentTabs, which navigates between real pages — switches which
 * environment's full posture is shown below; each tab carries a compact
 * score so "per-environment scores" (the phase's own bullet) is visible at
 * a glance without leaving the panel. One "Run scan" scans every
 * environment in the project at once, since that's what runSecurityScan
 * already does in a single call.
 */
export function ScannerPanel({
  teamId,
  teamSlug,
  projectId,
  environments,
  canRunScan,
  lastScannedLabel,
}: {
  teamId: string;
  teamSlug: string;
  projectId: string;
  environments: EnvironmentPosture[];
  canRunScan: boolean;
  /**
   * Already formatted, by the Server Component that renders this. Passed in
   * rather than derived here on purpose: this is a Client Component, so
   * anything computed from the current clock renders twice — once on the
   * server, once at hydration — and a relative time that crosses a minute
   * boundary between the two is a genuine hydration mismatch. Handing down
   * a finished string means both renders emit the identical text.
   */
  lastScannedLabel: string | null;
}) {
  const [state, formAction, isPending] = useActionState<RunScanState, FormData>(
    runScan,
    initialState,
  );
  const [selectedId, setSelectedId] = useState(environments[0]?.environmentId);

  const selected = environments.find((env) => env.environmentId === selectedId) ?? environments[0];

  // Every project always has at least the three default environments
  // (Phase 18), so this only guards the type — there is nothing sensible to
  // render for a project with zero environments.
  if (!selected) return null;

  const hasVariables = selected.variableCount > 0;
  const hasBeenScanned = selected.latest !== null;
  const displayScore = hasVariables && hasBeenScanned ? selected.latest!.score : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          {lastScannedLabel ? `Last scanned ${lastScannedLabel}` : "Never scanned"}
        </p>

        {/* Absent, not disabled, for readonly members — same pattern as
            every other management action in this app. Readonly members can
            still see whatever the last scan found; Phase 11's own SELECT
            policy on security_scans already grants that. */}
        {canRunScan && (
          <form action={formAction}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="teamSlug" value={teamSlug} />
            <input type="hidden" name="projectId" value={projectId} />
            <button
              type="submit"
              disabled={isPending}
              className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
            >
              {isPending ? "Scanning…" : "Run scan"}
            </button>
          </form>
        )}
      </div>

      {isPending && (
        <p className="text-sm text-ink/60" role="status">
          Checking every variable against the rules, then asking the AI layer for anything they
          missed…
        </p>
      )}

      {state.status === "error" && !isPending && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </div>
      )}

      {/* Not an error — the scan completed and its rule findings are real,
          the AI layer just didn't add to them this time (no key configured,
          Groq unreachable, or the safety check stopped it). Worth saying so
          rather than silently under-delivering on the "AI adds what rules
          can't" promise. */}
      {state.status === "ok" && !isPending && state.aiStatus !== "ok" && state.aiDetail && (
        <p className="text-xs text-ink/50">{state.aiDetail}</p>
      )}

      <div
        role="tablist"
        aria-label="Environments"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {environments.map((env) => {
          const isActive = env.environmentId === selected.environmentId;
          const envAccent = environmentAccentClasses(env.environmentName);
          const badge =
            env.variableCount === 0 || env.latest === null ? "—" : String(env.latest.score);

          return (
            <button
              key={env.environmentId}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedId(env.environmentId)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium capitalize ${focusRing} ${
                isActive ? `${envAccent.border} text-ink` : "border-transparent text-ink/70 hover:bg-card"
              }`}
            >
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${envAccent.dot}`} />
              {env.environmentName}
              <span className="font-normal text-ink/40">{badge}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm capitalize text-ink/60">{selected.environmentName}</p>
            <p className={`text-5xl font-semibold ${displayScore === null ? "text-ink/30" : "text-ink"}`}>
              {displayScore ?? "—"}
              <span className="text-lg font-normal text-ink/40"> /100</span>
            </p>
          </div>

          {selected.history.length > 1 && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-ink/50">Score history</span>
              <ScoreSparkline history={selected.history} environmentName={selected.environmentName} />
            </div>
          )}
        </div>

        <PostureMeter score={displayScore} environmentName={selected.environmentName} />

        {!hasVariables ? (
          <p className="text-sm text-ink/60">No variables in this environment yet — nothing to scan.</p>
        ) : !hasBeenScanned ? (
          <p className="text-sm text-ink/60">Not yet scanned. Run a scan to see its posture.</p>
        ) : (
          <FindingsList
            findings={selected.latest!.findings}
            teamSlug={teamSlug}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}
