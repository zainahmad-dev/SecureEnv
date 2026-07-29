import { createClient } from "@/lib/supabase/server";

/** The slug of the current user's earliest-joined team, or null if they have none. */
export async function getFirstTeamSlug(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("teams(slug)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.teams?.slug ?? null;
}
