import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Supabase client for use in Client Components. Uses the public anon key only. */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
