"use client";

import { useActionState } from "react";
import { logInAsDemo, type DemoLoginState } from "@/lib/demo/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const initialState: DemoLoginState = { error: null };

/**
 * The whole point of Phase 43: someone evaluating this project should be
 * able to see it without creating an account.
 *
 * Built as a form posting a server action rather than a link, so the
 * credentials stay on the server (lib/demo/actions.ts) — a link would have
 * to carry them, or expose an endpoint that logs anyone in on GET, which a
 * crawler or link preview would then trip.
 *
 * Rendered only where isDemoConfigured() is true, so this component never
 * has to render a disabled or apologetic state.
 */
export function DemoLoginButton({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState<DemoLoginState, FormData>(
    logInAsDemo,
    initialState,
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          disabled={isPending}
          className={`w-full rounded-lg border border-accent bg-accent/5 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-60 ${focusRing}`}
        >
          {isPending ? "Opening the demo…" : "Explore the demo — no signup"}
        </button>
      </form>

      <p className="text-center text-xs text-ink/55">
        Signs you into a shared, read-only account with realistic sample data.
      </p>

      {state.error && (
        <p role="alert" className="text-center text-xs text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
