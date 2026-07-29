import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

function requiredServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!value) {
    throw new Error(
      "Missing environment variable SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in your Supabase project values.",
    );
  }

  return value;
}

/**
 * Supabase client using the service role key. Server-only — bypasses Row Level
 * Security. Never import this into a Client Component or lib/supabase/client.ts.
 * The key is read lazily (not at module load) so importing this file doesn't
 * force every server module to have the key set — only code paths that actually
 * call createAdminClient() need it.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl, requiredServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
