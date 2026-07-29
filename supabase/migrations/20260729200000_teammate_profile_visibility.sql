-- Phase 14: let team members see each other's profiles.
--
-- Phase 7 gave profiles a self-only SELECT policy (auth.uid() = id), which was
-- right at the time — there were no teams yet, so "everyone can read every
-- profile row" would have been an unnecessary leak. Now that a members list
-- exists, that policy means a member screen can render nothing at all about
-- anyone but yourself: no name, no initials, just roles.
--
-- Widened to exactly the people you already share a team with, and no further.
-- A user who is in no team with you stays invisible, same as before.
--
-- Per the Phase 13 lesson (see 20260729180000_fix_team_bootstrap_policy.sql):
-- the cross-table lookup goes through a SECURITY DEFINER helper rather than an
-- inline subquery. An inline "select 1 from team_members ..." inside a policy
-- runs with the caller's own privileges and is silently re-filtered by
-- team_members' own SELECT policy, which is not what it looks like it says.

create function public.shares_team_with(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on b.team_id = a.team_id
    where a.user_id = p_user_a
      and b.user_id = p_user_b
  );
$$;

drop policy if exists "Users can view their own profile" on public.profiles;

create policy "Users can view their own and their teammates' profiles"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_team_with(auth.uid(), id));

-- The self-only UPDATE policy from Phase 7 is unchanged: seeing a teammate's
-- profile never implies editing it.
