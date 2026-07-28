import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_initials: string;
  created_at: string;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_initials, created_at")
    .eq("id", user.id)
    .single();

  return data;
}
