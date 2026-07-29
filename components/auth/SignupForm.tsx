"use client";

import { useActionState } from "react";
import { signUp, type SignupState } from "@/lib/auth/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

const fieldClass = `w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 ${focusRing}`;

const initialState: SignupState = { error: null, info: null, email: "" };

type SignupFormProps = {
  next?: string;
  /** Pre-fills the email field — used by the invite flow, where the address is known. */
  email?: string;
  /**
   * Locks the pre-filled address. A UI convenience only: a readOnly input is
   * trivially bypassed, and nothing downstream trusts it. The invite is bound
   * to its address inside accept_team_invite(), which compares the signed-in
   * account's real email against the one invited.
   */
  emailLocked?: boolean;
};

export function SignupForm({ next, email, emailLocked = false }: SignupFormProps) {
  const [state, formAction, isPending] = useActionState<SignupState, FormData>(
    signUp,
    initialState,
  );

  if (state.info) {
    return (
      <p
        role="status"
        className="rounded-lg border border-accent-dev/30 bg-accent-dev/10 px-3 py-2 text-sm text-ink"
      >
        {state.info}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          readOnly={emailLocked}
          defaultValue={state.email || email}
          className={`${fieldClass}${emailLocked ? " text-ink/70" : ""}`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          aria-describedby="password-hint"
          className={fieldClass}
        />
        <p id="password-hint" className="text-xs text-ink/50">
          At least 6 characters.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={`rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60 ${focusRing}`}
      >
        {isPending ? "Creating account…" : "Sign up"}
      </button>
    </form>
  );
}
