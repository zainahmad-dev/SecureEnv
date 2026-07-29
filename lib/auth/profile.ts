import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

// See lib/auth/session.ts — same per-request dedup, since the sidebar and a
// page's own content often both want the current profile.
export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_initials, last_team_id, created_at")
    .eq("id", user.id)
    .single();

  return data;
});
