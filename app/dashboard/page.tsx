import { AppShell } from "@/components/shell/AppShell";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <AppShell breadcrumb={["Dashboard"]}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-ink/60">Signed in as {user?.email}.</p>
        </div>

        <LogoutButton />
      </div>
    </AppShell>
  );
}
