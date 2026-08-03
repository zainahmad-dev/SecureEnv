import Link from "next/link";
import { SEVERITY_LABELS, severityBadgeClass } from "@/lib/scanner/presentation";
import { SEVERITY_ORDER, type Finding } from "@/lib/scanner/types";

/**
 * One environment's findings, grouped by severity, each with a Fix action
 * that deep-links to the offending variable.
 *
 * `finding.environmentName` is always the environment this list already
 * belongs to (lib/scanner/scan.ts's groupFindingsByEnvironment() puts each
 * finding on exactly the one environment it names), so the link target only
 * ever needs `finding.key` — a `reused-value` finding's `relatedKeys` may
 * name a different environment, but those are shown as text, not a second
 * Fix target, since the phase's own wording is "the offending variable" —
 * singular.
 */
export function FindingsList({
  findings,
  teamSlug,
  projectId,
}: {
  findings: Finding[];
  teamSlug: string;
  projectId: string;
}) {
  if (findings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-accent-dev">
        No issues found in this environment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {SEVERITY_ORDER.map((severity) => {
        const group = findings.filter((finding) => finding.severity === severity);
        if (group.length === 0) return null;

        return (
          <section key={severity} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              {SEVERITY_LABELS[severity]}{" "}
              <span className="font-normal text-ink/40">({group.length})</span>
            </h3>

            <ul className="flex flex-col gap-2">
              {group.map((finding) => (
                <li
                  key={`${finding.ruleId}-${finding.environmentName}-${finding.key}`}
                  className="flex flex-col gap-1.5 rounded-lg border border-line bg-paper p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadgeClass(finding.severity)}`}
                    >
                      {SEVERITY_LABELS[finding.severity]}
                    </span>

                    <Link
                      href={`/teams/${teamSlug}/projects/${projectId}/${finding.environmentName}?highlight=${encodeURIComponent(finding.key)}`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Fix →
                    </Link>
                  </div>

                  <code className="font-mono text-sm text-ink">{finding.key}</code>
                  <p className="text-sm text-ink/80">{finding.message}</p>
                  <p className="text-sm text-ink/60">
                    <span className="font-medium text-ink/70">Fix: </span>
                    {finding.fix}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
