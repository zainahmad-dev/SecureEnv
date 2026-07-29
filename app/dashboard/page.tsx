import { redirect } from "next/navigation";
import { getLandingTeamSlug } from "@/lib/teams/queries";

// Not a real page — /dashboard is the stable post-login redirect target
// wired through Phases 5/6 (login, signup, and middleware's `next` param all
// point here). It just resolves onward: no team yet -> onboarding, otherwise
// the user's last-visited team (Phase 16) or their earliest one if they have
// no last-visited preference yet.
export default async function DashboardPage() {
  const slug = await getLandingTeamSlug();
  redirect(slug ? `/teams/${slug}` : "/onboarding");
}
