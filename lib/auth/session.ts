import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// cache() dedupes calls with the same arguments within a single render pass —
// getTeamAccess, getSidebarData and a page's own guard can each call this
// once per request and only the first actually hits the Supabase Auth server.
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});
