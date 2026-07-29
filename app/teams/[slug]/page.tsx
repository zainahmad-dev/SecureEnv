import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function TeamDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // RLS scopes this to teams the current user is a member of — a slug that
  // doesn't exist and a slug the user has no access to are indistinguishable
  // here on purpose, both just return zero rows.
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!team) notFound();

  const { data: membership } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AppShell breadcrumb={[team.name]}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{team.name}</h1>
          <p className="text-ink/60">
            You&apos;re signed in as {user.email}
            {membership ? ` (${membership.role})` : ""}.
          </p>
        </div>

        <LogoutButton />
      </div>
    </AppShell>
  );
}
