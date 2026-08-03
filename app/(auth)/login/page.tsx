import type { Metadata } from "next";
import Link from "next/link";
import { GitHubButton } from "@/components/auth/GitHubButton";
import { LoginForm } from "@/components/auth/LoginForm";
import { DemoLoginButton } from "@/components/demo/DemoLoginButton";
import { isDemoConfigured } from "@/lib/demo/config";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Log in</h1>
      <p className="mb-6 text-sm text-ink/60">Welcome back to SecureEnv.</p>

      {/* Above the login form, not below it: someone arriving here without
          an account is the person this button exists for, and they decide
          within a few seconds whether this is worth signing up for. Phase 44
          renders the same component on the landing page. */}
      {isDemoConfigured() && (
        <div className="mb-6">
          <DemoLoginButton next={next} />
        </div>
      )}

      <LoginForm initialError={error} next={next} />

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink/40">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GitHubButton next={next} />

      <p className="mt-6 text-center text-sm text-ink/60">
        Don&apos;t have an account?{" "}
        <Link href={signupHref} className="font-medium text-accent hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
