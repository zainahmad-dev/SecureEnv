import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScannerPanel } from "@/components/scanner/ScannerPanel";
import { AppShell } from "@/components/shell/AppShell";
import { getProjectEnvironments } from "@/lib/environments/queries";
import { getProject } from "@/lib/projects/queries";
import { formatRelativeTime } from "@/lib/format/date";
import {
  buildEnvironmentPostures,
  getScanHistoryByEnvironment,
  latestScanAt,
} from "@/lib/scanner/history";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { createClient } from "@/lib/supabase/server";
import { getTeamAccess } from "@/lib/teams/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project ? `Security scan · ${project.name}` : "Security scan" };
}

export default async function ScannerPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;

  const project = await getProject(projectId);
  // Same team-mismatch guard as the environment and settings pages.
  if (!project || project.teamId !== team.id) notFound();

  const supabase = await createClient();
  const [sidebar, environments, histories] = await Promise.all([
    getSidebarData(team.id),
    getProjectEnvironments(project.id),
    getScanHistoryByEnvironment(supabase, project.id),
  ]);

  const postures = buildEnvironmentPostures(environments, histories);

  // Formatted here, in the Server Component, and handed to ScannerPanel as a
  // finished string — see the prop's own note for why deriving it inside a
  // Client Component is a hydration mismatch waiting for a minute boundary.
  const scannedAt = latestScanAt(postures);
  const lastScannedLabel = scannedAt ? formatRelativeTime(scannedAt) : null;

  return (
    <AppShell breadcrumb={[team.name, project.name, "Security scan"]} sidebar={sidebar}>
      <div className="flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Security scan</h1>
          <p className="mt-1 text-ink/60">{project.name}</p>
        </div>

        <ScannerPanel
          teamId={team.id}
          teamSlug={team.slug}
          projectId={project.id}
          environments={postures}
          canRunScan={role !== "readonly"}
          lastScannedLabel={lastScannedLabel}
        />
      </div>
    </AppShell>
  );
}
