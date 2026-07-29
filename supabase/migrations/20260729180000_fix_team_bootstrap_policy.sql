-- Fixes a bug in the Phase 11 migration's team_members bootstrap policy
-- (20260729160000_row_level_security.sql, already applied — hence a new
-- migration rather than an edit to that file).
--
-- The original bootstrap clause used raw subqueries straight against
-- public.teams and public.team_members:
--
--   not exists (select 1 from public.team_members existing where ...)
--   and exists (select 1 from public.teams t where t.id = ... and t.created_by = auth.uid())
--
-- Both tables have RLS enabled, and this policy runs under the caller's own
-- privileges (it's an authenticated user's own INSERT), so both subqueries
-- are themselves filtered by their table's SELECT policy — the exact
-- bootstrap trap is_team_member's SECURITY DEFINER was built to avoid,
-- just not applied consistently to these two checks:
--
--   - At the moment of bootstrapping, is_team_member(team_id, ..., 'readonly')
--     is false (that's the whole point — nobody's a member yet), so
--     team_members' own SELECT policy hides every row of that team from the
--     caller. "not exists (select ... from team_members ...)" isn't reading
--     the real global state, it's reading "what this caller can see" — which
--     is always nothing for a team they're not in yet. That happens to give
--     the right answer for a genuinely brand-new team, but the same blind
--     spot means a user could satisfy "not exists" for a team that already
--     has real members, as long as they aren't one of them — an actual
--     privilege-escalation path, not just a bootstrapping inconvenience.
--   - Symmetrically, teams' SELECT policy hides the just-created team row
--     from the caller until they're a member, so "exists (select ... from
--     teams where created_by = auth.uid())" can also be denied visibility
--     it should have.
--
-- Fix: route both checks through a single SECURITY DEFINER function that
-- bypasses RLS on both tables for this one narrow, safe check, the same way
-- is_team_member already bypasses it for team_members elsewhere.

create function public.can_bootstrap_team_admin(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.created_by = p_user_id
  )
  and not exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id
  );
$$;

drop policy "Admins can add members, or a creator can bootstrap the first admin"
  on public.team_members;

create policy "Admins can add members, or a creator can bootstrap the first admin"
  on public.team_members for insert
  to authenticated
  with check (
    public.is_team_member(team_id, auth.uid(), 'admin')
    or (
      user_id = auth.uid()
      and role = 'admin'
      and public.can_bootstrap_team_admin(team_id, auth.uid())
    )
  );
