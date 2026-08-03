"use server";

import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { DEMO_DENIED_MESSAGE, isDemoSession } from "@/lib/demo/guard";
import { createClient } from "@/lib/supabase/server";
import { setLastTeam } from "@/lib/teams/queries";
import { isReservedSlug, slugify, withRandomSuffix } from "@/lib/teams/slug";

export type CreateTeamState = { error: string | null; name: string };

const MAX_SLUG_ATTEMPTS = 3;

export async function createTeam(
  _prevState: CreateTeamState,
  formData: FormData,
): Promise<CreateTeamState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Enter a team name.", name };
  }
  if (name.length > 60) {
    return { error: "Team name must be 60 characters or fewer.", name };
  }

  // There's no existing team to check membership/role against here — this
  // *creates* one — so "authenticated" is the whole check. Phase 28 audit
  // finding: this was previously missing entirely, relying only on
  // create_team()'s own RLS-enforced INSERT (`to authenticated`) to reject
  // a signed-out caller, which it does — but silently, surfacing as the
  // generic "Could not create the team" message below rather than a
  // redirect to /login like every other action in this codebase gives.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The one mutating action that can't route through requireTeamAccess()
  // (there is no existing team to check against), so Phase 43's demo check
  // is repeated here explicitly rather than inherited. Without it, a demo
  // visitor is the only caller in the app who could still write — the
  // RESTRICTIVE policy on `teams` would reject create_team() anyway, but
  // silently, as the generic "Could not create the team" below.
  if (await isDemoSession()) {
    return { error: DEMO_DENIED_MESSAGE, name };
  }

  const supabase = await createClient();
  const baseSlug = slugify(name);
  // A team whose name slugifies to a reserved word (e.g. "New") would
  // otherwise be permanently unreachable — masked by a static /teams/<word>
  // route rather than caught by the database's uniqueness constraint, which
  // wouldn't notice this at all.
  let slug = isReservedSlug(baseSlug) ? withRandomSuffix(baseSlug) : baseSlug;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    // No .single() here: create_team() returns a single teams row directly
    // (RETURNS public.teams, not SETOF), so the RPC result is already a
    // plain object, not an array — .single() assumes an array to unwrap and
    // resolves to `never` for a function whose Returns isn't one.
    const { data, error } = await supabase.rpc("create_team", { p_name: name, p_slug: slug });

    if (!error) {
      // Awaited, not fire-and-forget: this has to land before the redirect
      // below, which throws internally and ends the action — anything
      // scheduled after it would never run. created_by is the acting user's
      // own id (create_team sets it to auth.uid()), so no extra lookup is
      // needed to know whose preference this is.
      if (data.created_by) {
        await setLastTeam(data.created_by, data.id);
      }

      // Logged before redirect() — it throws internally, so nothing after
      // it would ever run. The new team is its own audit context: there's
      // no "parent" team_id to attribute this to, so it's logged against
      // itself, the same way its first team_members row (inserted by
      // create_team() in the same transaction) has nothing preceding it
      // either.
      await logAudit({
        teamId: data.id,
        userId: user.id,
        action: "create",
        targetType: "team",
        targetId: data.id,
        metadata: { name },
      });

      redirect(`/teams/${data.slug}`);
    }

    // 23505 = unique_violation. Only the slug collides in practice (name has
    // no uniqueness constraint), so retry with a random suffix rather than
    // failing a first-time user over a team name someone else already used.
    if (error.code !== "23505") {
      return { error: "Could not create the team. Try again.", name };
    }

    slug = withRandomSuffix(baseSlug);
  }

  return { error: "Could not create a unique team URL. Try a different name.", name };
}
