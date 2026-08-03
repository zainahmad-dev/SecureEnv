import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DemoLoginButton } from "@/components/demo/DemoLoginButton";
import { EnvelopeDiagram } from "@/components/landing/EnvelopeDiagram";
import { LandingNav } from "@/components/landing/LandingNav";
import { RedactionDemo } from "@/components/landing/RedactionDemo";
import { getCurrentUser } from "@/lib/auth/session";
import { isDemoConfigured } from "@/lib/demo/config";
import { GITHUB_URL, PORTFOLIO_URL } from "@/lib/site";

export const metadata: Metadata = {
  // Absolute, so this one page escapes the root layout's "%s · SecureEnv"
  // template — "SecureEnv · SecureEnv" is not what belongs in a shared link
  // or a browser tab for the front page.
  title: { absolute: "SecureEnv — the redaction ledger for team secrets" },
  description:
    "A secrets manager for small dev teams. Every value encrypted per-variable, revealed one at a time on request, and every read written to an append-only ledger.",
};

const FEATURES = [
  {
    title: "Encrypted storage",
    body: "Every value is encrypted under its own one-time key before it reaches the database — there is no plaintext column to leak. Values render redacted; revealing one is a separate, explicit request that decrypts exactly that row and nothing else.",
    image: "/screenshots/encrypted-storage.jpg",
    alt: "The variables list with values redacted, one revealed showing a countdown before it re-masks, and the activity panel recording that read.",
  },
  {
    title: "Team access control",
    body: "Admin, member, and read-only roles, enforced by Postgres row-level security rather than by hiding buttons. A team can never end up with zero admins — that rule is a database trigger, so it holds even against a request the UI never made.",
    image: "/screenshots/team-access.jpg",
    alt: "The members screen showing three roles, an invite form, and the last-admin protection message.",
  },
  {
    title: "AI security scanning",
    body: "Deterministic rules catch short secrets, live keys outside production, and values reused across environments. An LLM layer adds the naming and structural problems rules can't express — reading only metadata about each variable, never its value.",
    image: "/screenshots/ai-scanner.jpg",
    alt: "The security scan screen showing a low score, a segmented meter, and findings grouped by severity.",
  },
] as const;

export default async function LandingPage() {
  // This page is public (see middleware's PUBLIC_EXACT_PATHS), so there is
  // usually no session here at all — getCurrentUser() returning null is the
  // normal case, not an error one. It only changes which call-to-action the
  // header shows.
  const user = await getCurrentUser();
  const isSignedIn = user !== null;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <LandingNav isSignedIn={isSignedIn} />

      <main className="flex-1">
        {/* ---------------------------------------------------------------
            Hero
        --------------------------------------------------------------- */}
        <section className="mx-auto w-full max-w-5xl px-4 py-14 min-[900px]:px-8 min-[900px]:py-20">
          <h1 className="text-4xl font-semibold tracking-tight text-ink min-[900px]:text-5xl">
            SecureEnv
          </h1>
          <p className="mt-2 text-xl text-accent min-[900px]:text-2xl">
            the redaction ledger for team secrets
          </p>

          <p className="mt-6 max-w-2xl text-lg text-ink/70">
            Your team&apos;s API keys are scattered across Slack messages, `.env` files, and
            someone&apos;s laptop — and nobody can say who has seen which one.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {isDemoConfigured() && !isSignedIn && (
              <div className="w-full max-w-sm">
                <DemoLoginButton />
              </div>
            )}
            {isSignedIn && (
              <Link
                href="/dashboard"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
              >
                Open your dashboard
              </Link>
            )}
          </div>

          {/* The interaction, not a picture of it — see RedactionDemo. */}
          <div className="mt-12">
            <RedactionDemo />
            <p className="mt-3 text-sm text-ink/50">
              Try it — this is the real interaction, running right here on this page.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Features
        --------------------------------------------------------------- */}
        <section className="border-t border-line bg-card/40">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-14 min-[900px]:px-8 min-[900px]:py-20">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.title}
                className="grid items-center gap-6 min-[900px]:grid-cols-2 min-[900px]:gap-10"
              >
                <div className={index % 2 === 1 ? "min-[900px]:order-2" : undefined}>
                  <h2 className="text-2xl font-semibold text-ink">{feature.title}</h2>
                  <p className="mt-3 text-ink/70">{feature.body}</p>
                </div>

                {/* Real product screenshots, captured from the running app.
                    next/image so they're served in a modern format at the
                    size actually needed — the "fast" half of this phase's
                    brief is mostly this. */}
                <div className={index % 2 === 1 ? "min-[900px]:order-1" : undefined}>
                  <Image
                    src={feature.image}
                    alt={feature.alt}
                    width={1568}
                    height={720}
                    sizes="(max-width: 900px) 100vw, 50vw"
                    className="w-full rounded-xl border border-line shadow-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Encryption
        --------------------------------------------------------------- */}
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 min-[900px]:px-8 min-[900px]:py-20">
            <h2 className="text-2xl font-semibold text-ink">How the encryption works</h2>
            <p className="mt-3 max-w-2xl text-ink/70">
              Envelope encryption. Each value gets its own single-use key, and only that key is
              encrypted under the master key — which lives in an environment variable, never in
              the database.
            </p>

            <div className="mt-8">
              <EnvelopeDiagram />
            </div>

            <p className="mt-6 max-w-2xl text-sm text-ink/55">
              The extra layer is what makes key rotation cheap later: rotating means re-wrapping
              each small key, not re-encrypting every stored secret. A database-only breach yields
              ciphertext and nothing else.
            </p>

            <a
              href={`${GITHUB_URL}#encryption-design`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
            >
              Read the full design →
            </a>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Closing call to action
        --------------------------------------------------------------- */}
        <section className="border-t border-line bg-card/40">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 min-[900px]:px-8">
            <h2 className="text-2xl font-semibold text-ink">See it with real data</h2>
            <p className="mt-3 max-w-xl text-ink/70">
              The demo is a shared, read-only account preloaded with three projects, a populated
              audit trail, and a security scan with genuine findings. No signup.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {isDemoConfigured() && !isSignedIn && (
                <div className="w-full max-w-sm">
                  <DemoLoginButton />
                </div>
              )}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-accent hover:underline"
              >
                View the source on GitHub →
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 min-[900px]:px-8">
          <p className="text-sm text-ink/50">
            SecureEnv — a portfolio project. The data in the demo is fictional.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink/60 hover:text-ink"
            >
              GitHub
            </a>
            {PORTFOLIO_URL && (
              <a
                href={PORTFOLIO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-ink/60 hover:text-ink"
              >
                Portfolio
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
