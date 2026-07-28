const environments = [
  { name: "development", swatch: "bg-accent-dev" },
  { name: "staging", swatch: "bg-accent-staging" },
  { name: "production", swatch: "bg-accent-production" },
] as const;

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold text-ink">SecureEnv</h1>
        <p className="text-ink/60">
          Next.js 15 + TypeScript (strict) + Tailwind CSS — scaffold is live.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-line bg-card p-6 shadow-sm">
        <p className="mb-4 text-sm font-medium text-ink/70">Design tokens</p>
        <div className="flex items-center gap-3">
          <span className="h-8 w-8 rounded-full bg-accent" />
          <span className="text-sm text-ink">accent</span>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {environments.map((env) => (
            <div key={env.name} className="flex items-center gap-3">
              <span className={`h-8 w-8 rounded-full ${env.swatch}`} />
              <span className="text-sm capitalize text-ink">{env.name}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
