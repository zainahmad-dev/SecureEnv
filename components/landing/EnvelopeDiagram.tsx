/**
 * The envelope-encryption diagram, built from styled boxes rather than
 * rendered by a diagramming library.
 *
 * The README draws this in Mermaid, which GitHub renders server-side for
 * free. A landing page has no such luxury — shipping Mermaid to the browser
 * would mean several hundred kilobytes of JavaScript to draw four
 * rectangles, on the one page in this project whose brief explicitly says
 * "fast, no heavy animation libraries". These boxes cost nothing, inherit
 * the design tokens (so dark mode works with no extra code), reflow on
 * narrow screens, and are real text a screen reader can read in order.
 *
 * A Server Component: there is no interactivity here, so none of it needs
 * to reach the browser as JavaScript at all.
 */

const STEPS = [
  {
    label: "Your secret",
    detail: "sk_live_…",
    tone: "plain",
  },
  {
    label: "Encrypted with a one-time key",
    detail: "AES-256-GCM · a fresh DEK per value",
    tone: "accent",
  },
  {
    label: "That key is itself encrypted",
    detail: "wrapped with the master key",
    tone: "accent",
  },
  {
    label: "Stored",
    detail: "ciphertext only — no plaintext column exists",
    tone: "muted",
  },
] as const;

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center text-ink/30 min-[900px]:rotate-0 rotate-90"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M4 10h12m0 0-4-4m4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function EnvelopeDiagram() {
  return (
    <div className="flex flex-col items-stretch gap-2 min-[900px]:flex-row min-[900px]:items-center">
      {STEPS.map((step, index) => (
        <div key={step.label} className="contents">
          {/* min-w-0 because a flex item defaults to `min-width: auto`,
              which refuses to shrink below its content's intrinsic width —
              the monospace detail lines below are exactly the kind of
              unbreakable content that turns that default into horizontal
              overflow on a narrow screen. */}
          <div
            className={`min-w-0 flex-1 rounded-xl border p-4 ${
              step.tone === "accent"
                ? "border-accent/30 bg-accent/5"
                : step.tone === "muted"
                  ? "border-line bg-card"
                  : "border-line bg-paper"
            }`}
          >
            <p className="text-sm font-medium text-ink">{step.label}</p>
            <p className="mt-1 font-mono text-xs text-ink/55">{step.detail}</p>
          </div>
          {index < STEPS.length - 1 && <Arrow />}
        </div>
      ))}
    </div>
  );
}
