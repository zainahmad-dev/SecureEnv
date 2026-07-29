import { getCurrentProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserTeams, type UserTeamSummary } from "@/lib/teams/queries";

export type SidebarData = {
  teams: UserTeamSummary[];
  currentTeamId: string | null;
  profile: {
    displayName: string | null;
    initials: string;
    email: string;
  };
};

/**
 * Everything the sidebar needs to render real data instead of Phase 4's
 * placeholders, gathered once per page and threaded down as props.
 *
 * AppShell is a Client Component (it owns the mobile drawer's open/close
 * state), and Sidebar is rendered from inside it — so neither can fetch
 * anything themselves; this has to run in the Server Component page that
 * renders AppShell. getCurrentUser/getCurrentProfile are both wrapped in
 * React's cache(), so calling them again here costs nothing extra on pages
 * (like /teams/[slug]) that already resolved the same user via getTeamAccess.
 */
export async function getSidebarData(currentTeamId: string | null = null): Promise<SidebarData> {
  const [user, profile, teams] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getUserTeams(),
  ]);

  return {
    teams,
    currentTeamId,
    profile: {
      displayName: profile?.display_name ?? null,
      initials: profile?.avatar_initials ?? "??",
      email: user?.email ?? "",
    },
  };
}
