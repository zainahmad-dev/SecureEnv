"use client";

import { useEffect, useRef, useState } from "react";

const REVEAL_DURATION_MS = 8000;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * Fake, and it has to be. This component renders on a page with no
 * authentication, so there is nothing here to fetch and nothing to
 * decrypt — the string below is a literal in the browser bundle. That is
 * also why it is shaped to fail a real secret scanner's pattern match
 * (literal words and underscores where a genuine key is pure base62), the
 * same rule lib/demo/fixture.ts follows.
 */
const ROWS = [
  { key: "DATABASE_URL", masked: true },
  { key: "STRIPE_SECRET_KEY", masked: true, revealable: true },
  { key: "NEXT_PUBLIC_APP_URL", masked: false, value: "https://northstar.example" },
] as const;

const REVEALED_VALUE = "sk_live_FAKE_not_a_real_key_DO_NOT_USE";

type LedgerEntry = { id: number; at: string };

/**
 * The hero interaction: click the redaction bar, watch the value appear —
 * and watch a line appear in the ledger beside it at the same moment.
 *
 * That pairing is the entire pitch, which is why this is a live widget and
 * not a screenshot. "Redaction ledger" is two claims: secrets are hidden by
 * default, *and* looking at one is recorded. A static image can show the
 * first; only this can show the second happening as a consequence of the
 * first.
 *
 * No animation library, no network, no timers beyond one re-mask timeout —
 * the countdown is a plain CSS width transition, the same technique the
 * real RevealableValue uses in the app.
 */
export function RedactionDemo() {
  const [revealed, setRevealed] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function reveal() {
    if (revealed) return;

    setRevealed(true);
    setCollapsing(false);
    // One frame later, so the bar has a full width to animate *from*.
    requestAnimationFrame(() => setCollapsing(true));

    setLedger((current) =>
      [
        {
          id: nextId.current++,
          // Rendered only after this click, so it never differs between the
          // server render and hydration — a relative timestamp computed
          // during render would (see lib/scanner/history.ts's note).
          at: new Date().toLocaleTimeString("en-US", { hour12: false }),
        },
        ...current,
      ].slice(0, 4),
    );

    timer.current = setTimeout(() => setRevealed(false), REVEAL_DURATION_MS);
  }

  return (
    <div className="grid w-full gap-4 min-[880px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* The variables panel */}
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-production" />
          <span className="text-xs font-medium uppercase tracking-wide text-ink/60">
            production
          </span>
        </div>

        <ul className="divide-y divide-line">
          {ROWS.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <code className="min-w-0 truncate font-mono text-xs text-ink min-[520px]:text-sm">
                {row.key}
              </code>

              {!row.masked ? (
                <code className="truncate font-mono text-xs text-ink/50">{row.value}</code>
              ) : "revealable" in row && row.revealable ? (
                revealed ? (
                  <div className="flex min-w-0 flex-col items-end gap-1">
                    <code className="truncate font-mono text-xs text-ink">{REVEALED_VALUE}</code>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-accent">
                        revealed · logged
                      </span>
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-ink/10">
                        <span
                          className={`block h-full rounded-full bg-accent transition-[width] ease-linear motion-reduce:transition-none ${
                            collapsing ? "w-0" : "w-full"
                          }`}
                          style={{ transitionDuration: `${REVEAL_DURATION_MS}ms` }}
                        />
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={reveal}
                    aria-label={`Reveal the value of ${row.key}`}
                    className={`group inline-flex shrink-0 items-center gap-2 rounded ${focusRing}`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-24 rounded bg-ink/15 transition-opacity group-hover:opacity-70 motion-reduce:transition-none min-[520px]:w-32"
                    />
                    <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-accent">
                      Click to reveal
                    </span>
                  </button>
                )
              ) : (
                <span aria-hidden="true" className="h-4 w-24 shrink-0 rounded bg-ink/15 min-[520px]:w-32" />
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* The ledger half */}
      <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Audit ledger</p>

        {/* aria-live so the point lands for a screen-reader user too: the
            reveal and the ledger entry are one event, not two. */}
        <ul aria-live="polite" className="mt-3 flex flex-col gap-2">
          {ledger.length === 0 ? (
            <li className="text-sm text-ink/40">Nothing read yet.</li>
          ) : (
            ledger.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 motion-safe:animate-[row-in_0.3s_ease-out_backwards]"
              >
                <span className="text-xs font-medium text-ink">
                  you revealed <code className="font-mono">STRIPE_SECRET_KEY</code>
                </span>
                <span className="text-[11px] text-ink/50">production · {entry.at}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
