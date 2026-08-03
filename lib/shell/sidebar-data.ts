import { getCurrentProfile } from "@/lib/auth/profile";
import { getCurrentUser } from "@/lib/auth/session";
import { getTeamProjects, type ProjectSummary } from "@/lib/projects/queries";
import { getUserTeams, type UserTeamSummary } from "@/lib/teams/queries";

export type SidebarData = {
  teams: UserTeamSummary[];
  currentTeamId: string | null;
  projects: ProjectSummary[];
  profile: {
    displayName: string | null;
    initials: string;
    email: string;
  };
  /**
   * Whether this session is the shared public demo account (Phase 43) —
   * what AppShell uses to decide whether to render the demo banner.
   *
   * It rides along here rather than as its own AppShell prop for one
   * reason: this function is already the single place every page resolves
   * "who is the current user" for the shell, and it already has the profile
   * row in hand. A separate prop would mean touching all six AppShell call
   * sites and re-fetching the same row to answer a question the data here
   * already contains.
   */
  isDemo: boolean;
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
  const [user, profile, teams, projects] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getUserTeams(),
    currentTeamId ? getTeamProjects(currentTeamId) : Promise.resolve([]),
  ]);

  return {
    teams,
    currentTeamId,
    projects,
    profile: {
      displayName: profile?.display_name ?? null,
      initials: profile?.avatar_initials ?? "??",
      email: user?.email ?? "",
    },
    isDemo: profile?.is_demo ?? false,
  };
}
