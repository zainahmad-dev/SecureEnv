import { environmentAccentClasses } from "@/lib/environments/presentation";

const SEGMENT_COUNT = 10;

/**
 * A 10-segment meter, tinted with the environment's own accent — literally
 * what the phase asks for, reusing the same dev/staging/production
 * classification the tab strip and environment pages already use rather
 * than inventing a parallel red/amber/green severity scale for the meter
 * itself. Severity colour lives on individual findings instead (see
 * lib/scanner/presentation.ts) — the two axes (which environment, how bad)
 * are kept visually separate on purpose.
 *
 * `score: null` — no variables, or never scanned — draws every segment
 * empty. It never renders a red "0" meter, which would read as "this
 * environment is unsafe" when the truer statement is "there is nothing to
 * say yet".
 */
export function PostureMeter({
  score,
  environmentName,
}: {
  score: number | null;
  environmentName: string;
}) {
  const accent = environmentAccentClasses(environmentName);
  const filled = score === null ? 0 : Math.max(0, Math.min(SEGMENT_COUNT, Math.round(score / 10)));

  return (
    <div
      role="img"
      aria-label={score === null ? "No score yet" : `Score ${score} out of 100`}
      className="flex gap-1"
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`h-2 flex-1 rounded-full ${index < filled ? accent.dot : "bg-ink/10"}`}
        />
      ))}
    </div>
  );
}
