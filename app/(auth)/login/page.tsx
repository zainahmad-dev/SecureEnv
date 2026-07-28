import Link from "next/link";
import { GitHubButton } from "@/components/auth/GitHubButton";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Log in</h1>
      <p className="mb-6 text-sm text-ink/60">Welcome back to SecureEnv.</p>

      <LoginForm initialError={error} />

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink/40">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <GitHubButton />

      <p className="mt-6 text-center text-sm text-ink/60">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
