"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };
export type SignupState = { error: string | null; info: string | null; email: string };

function friendlyMessage(message: string): string {
  if (message === "Invalid login credentials") return "Incorrect email or password.";
  return message;
}

export async function logIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyMessage(error.message), email };
  }

  redirect("/dashboard");
}

export async function signUp(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", info: null, email };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters.", info: null, email };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { error: friendlyMessage(error.message), info: null, email };
  }

  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { error: "An account with this email already exists.", info: null, email };
  }

  if (!data.session) {
    return {
      error: null,
      info: "Check your email to confirm your account, then log in.",
      email,
    };
  }

  redirect("/dashboard");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signInWithGitHub() {
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    redirect("/login?error=Could not start GitHub sign-in.");
  }

  redirect(data.url);
}
