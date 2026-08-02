import type { Metadata } from "next";
import Link from "next/link";
import { GitHubButton } from "@/components/auth/GitHubButton";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Create an account</h1>
      <p className="mb-6 text-sm text-ink/60">Start securing your team&apos;s secrets.</p>

      <SignupForm next={next} />

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink/40">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GitHubButton next={next} />

      <p className="mt-6 text-center text-sm text-ink/60">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
