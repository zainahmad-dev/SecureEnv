import { getCurrentProfile } from "@/lib/auth/profile";

/**
 * The message every blocked demo mutation shows.
 *
 * Phrased as an explanation of the demo, not as a permission error — a
 * visitor clicking "Delete" on seeded data hasn't done anything wrong, and
 * "you don't have permission" would read as a bug in the demo rather than
 * the point of it. It also says where the real thing is, since someone
 * hitting this wall is exactly the person who might want to sign up.
 */
export const DEMO_DENIED_MESSAGE =
  "This is a read-only demo, so nothing you do here can change the data. Create a free account to try this for real.";

/**
 * True when the current session is the shared public demo account.
 *
 * Reads profiles.is_demo through getCurrentProfile(), which is wrapped in
 * React's cache() — so on a page that already resolved the profile (every
 * page rendering AppShell does), this costs nothing extra.
 *
 * This is a *preflight*, exactly like requireTeamAccess(): the actual
 * enforcement is the set of RESTRICTIVE RLS policies added in the Phase 43
 * migration, which reject the write no matter what path reaches the
 * database. This function exists so the screen can explain itself instead
 * of showing a raw error — or worse, showing nothing at all, since RLS
 * denies an UPDATE or DELETE by matching zero rows and returning
 * `error: null`, which reads as success to a caller that never checked.
 */
export async function isDemoSession(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.is_demo ?? false;
}
