import { notFound, redirect } from "next/navigation";
import { getProjectEnvironments } from "@/lib/environments/queries";
import { getProject } from "@/lib/projects/queries";
import { getTeamAccess } from "@/lib/teams/queries";

// A thin redirect, same shape as /dashboard -> /teams/[slug]: the bare
// project URL isn't a real page since Phase 19 — it exists only so links
// created before an environment is known (the sidebar, "New project"'s
// redirect target) have somewhere stable to point. It always lands on the
// first environment by sort order, which is always "development": the three
// defaults can never be deleted (Phase 18), so there's always at least one
// environment to redirect to.
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const project = await getProject(projectId);
  if (!project || project.teamId !== access.team.id) notFound();

  const environments = await getProjectEnvironments(projectId);
  const first = environments[0];
  if (!first) notFound();

  redirect(`/teams/${slug}/projects/${projectId}/${first.name}`);
}
