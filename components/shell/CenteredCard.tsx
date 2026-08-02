import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-paper">
              SE
            </span>
            <span className="text-base font-semibold text-ink">SecureEnv</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-xl border border-line bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
