import { AppShell } from "@/components/shell/AppShell";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function DashboardPage() {
  return (
    <AppShell breadcrumb={["Dashboard"]}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-ink/60">You&apos;re signed in.</p>
        </div>

        <LogoutButton />
      </div>
    </AppShell>
  );
}
