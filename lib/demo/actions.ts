"use server";

import { redirect } from "next/navigation";
import { resolveNextPath } from "@/lib/auth/next-path";
import { demoCredentials } from "@/lib/demo/config";
import { createClient } from "@/lib/supabase/server";

export type DemoLoginState = { error: string | null };

/**
 * One-click demo access: signs the visitor into the shared read-only
 * account without asking them for anything.
 *
 * The credentials are read server-side and never serialised to the client —
 * the button that calls this posts an empty form. That isn't really a
 * secrecy win (the account is public by design, and its password is in
 * .env.example), it's a blast-radius one: nothing about how this
 * deployment's demo account is configured is discoverable from the browser,
 * so pointing DEMO_USER_EMAIL at a different account later doesn't leak
 * that account's address to every visitor.
 *
 * Deliberately goes through the ordinary signInWithPassword flow rather
 * than minting a session some other way. The demo visitor gets a completely
 * normal session, subject to exactly the same middleware, RLS, and audit
 * behaviour as any signed-in user — there is no "demo code path" in this
 * app whose divergence from the real one could hide a bug.
 */
export async function logInAsDemo(
  _prevState: DemoLoginState,
  formData: FormData,
): Promise<DemoLoginState> {
  const credentials = demoCredentials();

  if (!credentials) {
    return { error: "Demo access isn't available on this deployment." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    // The provider's own message is deliberately not passed through here,
    // unlike the ordinary login form. A visitor who clicked one button
    // cannot act on "Invalid login credentials" — that message is about
    // this deployment's configuration, not about anything they did.
    console.error("Demo login failed:", error.message);
    return { error: "The demo account isn't set up on this deployment yet." };
  }

  redirect(resolveNextPath(formData.get("next") as string | null));
}
