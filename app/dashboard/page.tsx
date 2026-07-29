import { redirect } from "next/navigation";
import { getFirstTeamSlug } from "@/lib/teams/queries";

// Not a real page — /dashboard is the stable post-login redirect target
// wired through Phases 5/6 (login, signup, and middleware's `next` param all
// point here). It just resolves onward: no team yet -> onboarding, otherwise
// straight to that team's own dashboard at /teams/[slug].
export default async function DashboardPage() {
  const slug = await getFirstTeamSlug();
  redirect(slug ? `/teams/${slug}` : "/onboarding");
}
