import { createClient } from "@/lib/supabase/server";

export type ProjectSearchResult = { id: string; name: string };

export type VariableSearchResult = {
  id: string;
  key: string;
  environmentId: string;
  environmentName: string;
  projectId: string;
  projectName: string;
};

export type SearchResults = {
  projects: ProjectSearchResult[];
  variables: VariableSearchResult[];
};

const RESULT_LIMIT = 8;

/**
 * Escapes ILIKE's own wildcard characters (`%`, `_`) so a literal one typed
 * by the user searches for that character instead of silently matching
 * everything (`%`) or any single character (`_`). Backslash goes first so
 * the escaping backslashes it just added aren't themselves re-escaped.
 */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (char) => `\\${char}`);
}

/**
 * Global search (Phase 33), scoped to one team: project names and variable
 * *keys* only — never values. Searching values would mean decrypting every
 * secret in the team on every keystroke, which defeats the whole point of
 * never bulk-decrypting (Phase 25's rule, restated in this phase's own
 * notes).
 *
 * The two unfiltered reads (all of the team's projects, then all of their
 * environments) exist to build id -> name lookups for display and to scope
 * the variables query — same "small dataset, map in JS, no raw `.or()`
 * filter string" shape Phase 30/31's queries already established. RLS is
 * still what actually authorizes every row returned here; a non-member's
 * `teamId` guess just gets zero rows back, same as `getTeamAccess` elsewhere.
 */
export async function searchTeam(teamId: string, rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (!query) return { projects: [], variables: [] };

  const supabase = await createClient();
  const needle = query.toLowerCase();

  const { data: allProjects } = await supabase.from("projects").select("id, name").eq("team_id", teamId);
  const projects = allProjects ?? [];
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const projectIds = projects.map((project) => project.id);

  const matchingProjects: ProjectSearchResult[] = projects
    .filter((project) => project.name.toLowerCase().includes(needle))
    .slice(0, RESULT_LIMIT)
    .map((project) => ({ id: project.id, name: project.name }));

  let variables: VariableSearchResult[] = [];

  if (projectIds.length > 0) {
    const { data: environmentRows } = await supabase
      .from("environments")
      .select("id, name, project_id")
      .in("project_id", projectIds);

    const environments = environmentRows ?? [];
    const environmentMap = new Map(environments.map((environment) => [environment.id, environment]));
    const environmentIds = environments.map((environment) => environment.id);

    if (environmentIds.length > 0) {
      const { data: matches } = await supabase
        .from("variables")
        .select("id, key, environment_id")
        .in("environment_id", environmentIds)
        .ilike("key", `%${escapeIlike(query)}%`)
        .order("key", { ascending: true })
        .limit(RESULT_LIMIT);

      variables = (matches ?? []).flatMap((variable) => {
        const environment = environmentMap.get(variable.environment_id);
        if (!environment) return [];

        return [
          {
            id: variable.id,
            key: variable.key,
            environmentId: environment.id,
            environmentName: environment.name,
            projectId: environment.project_id,
            projectName: projectNames.get(environment.project_id) ?? "Unknown project",
          },
        ];
      });
    }
  }

  return { projects: matchingProjects, variables };
}
