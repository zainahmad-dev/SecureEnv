import { createClient } from "@/lib/supabase/server";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  variableCount: number;
};

/**
 * Counts variables per project by summing variable ids embedded under each
 * project's environments. Two queries rather than one nested embed
 * (projects -> environments -> variables) — keeps the shape simple and
 * avoids relying on multi-level embed type inference for a count that's
 * only ever used for display, never for authorization.
 */
async function countVariablesByProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (projectIds.length === 0) return counts;

  const { data } = await supabase
    .from("environments")
    .select("project_id, variables(id)")
    .in("project_id", projectIds);

  for (const env of data ?? []) {
    const existing = counts.get(env.project_id) ?? 0;
    counts.set(env.project_id, existing + (env.variables?.length ?? 0));
  }

  return counts;
}

/** A team's projects, alphabetical by name — what the sidebar renders. */
export async function getTeamProjects(teamId: string): Promise<ProjectSummary[]> {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .eq("team_id", teamId)
    .order("name", { ascending: true });

  const rows = projects ?? [];
  const counts = await countVariablesByProject(
    supabase,
    rows.map((project) => project.id),
  );

  return rows.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    variableCount: counts.get(project.id) ?? 0,
  }));
}

export type ProjectDetail = {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  createdAt: string;
  variableCount: number;
};

/**
 * A single project by id, or null if it doesn't exist or the caller's RLS
 * visibility excludes it (a non-member gets the same null a missing id
 * would — indistinguishable on purpose, same reasoning as getTeamAccess).
 */
export async function getProject(projectId: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, team_id, name, description, created_at")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const counts = await countVariablesByProject(supabase, [project.id]);

  return {
    id: project.id,
    teamId: project.team_id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    variableCount: counts.get(project.id) ?? 0,
  };
}
