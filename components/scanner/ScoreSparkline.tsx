import { environmentAccentClasses } from "@/lib/environments/presentation";
import type { ScanRecord } from "@/lib/scanner/history";

const WIDTH = 120;
const HEIGHT = 28;
const MAX_SCORE = 100;

/**
 * Score history, oldest to newest. Renders nothing at all when there's
 * fewer than two points — Phase 41's own condition ("if more than one scan
 * exists") for whether this chart appears at all, so the caller doesn't
 * need to duplicate that check before rendering it.
 *
 * Uses `stroke-current` + a text-colour utility rather than a `stroke-*`
 * one, so it can reuse environmentAccentClasses' existing `text` variant —
 * one accent-colour source of truth for the whole panel (tab dot, meter,
 * and this line) instead of a second colour map just for SVG.
 */
export function ScoreSparkline({
  history,
  environmentName,
}: {
  history: ScanRecord[];
  environmentName: string;
}) {
  if (history.length < 2) return null;

  const stepX = WIDTH / (history.length - 1);
  const points = history
    .map((point, index) => {
      const x = index * stepX;
      const y = HEIGHT - (Math.max(0, Math.min(MAX_SCORE, point.score)) / MAX_SCORE) * HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const accent = environmentAccentClasses(environmentName);

  return (
    <>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={accent.text}
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{`Score history, oldest to newest: ${history.map((point) => point.score).join(", ")}.`}</span>
    </>
  );
}
