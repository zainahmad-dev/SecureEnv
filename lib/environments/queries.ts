import { createClient } from "@/lib/supabase/server";

/**
 * The three names create_project() (Phase 18 migration) always seeds. The
 * (project_id, name) unique constraint plus the rename/delete triggers mean
 * these names can never be freed up or reused by a custom environment within
 * the same project, so a plain name check is enough to tell a default
 * environment from a custom one — no separate column needed.
 */
export const DEFAULT_ENVIRONMENT_NAMES = ["development", "staging", "production"] as const;

export function isDefaultEnvironmentName(name: string): boolean {
  return (DEFAULT_ENVIRONMENT_NAMES as readonly string[]).includes(name);
}

export type EnvironmentSummary = {
  id: string;
  name: string;
  sortOrder: number;
  variableCount: number;
  isDefault: boolean;
};

/** A project's environments, in their configured display order. */
export async function getProjectEnvironments(projectId: string): Promise<EnvironmentSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("environments")
    .select("id, name, sort_order, variables(id)")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((env) => ({
    id: env.id,
    name: env.name,
    sortOrder: env.sort_order,
    variableCount: env.variables?.length ?? 0,
    isDefault: isDefaultEnvironmentName(env.name),
  }));
}
