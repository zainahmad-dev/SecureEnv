-- Phase 11: Row Level Security across every application table.
--
-- public.profiles already has its own self-only RLS policies from the
-- Phase 7 migration (auth.uid() = id) and needs no changes here.
--
-- This migration enables RLS on every remaining application table and adds
-- policies enforcing:
--   - a user can only see rows belonging to a team they are a member of
--   - only admins can insert/update/delete teams, members, and projects
--   - members can read and write variables; readonly members can only read
--   - audit_logs are insert-and-read only, never updatable/deletable by anyone
--
-- environments and security_scans aren't named explicitly by the phase's
-- rule text, but "every application table" needs policies. environments is
-- treated like projects (admin-gated mutation, member+readonly read) since
-- it's the same structural tier and Phase 18 auto-creates environments in
-- the same admin-only flow that creates a project. security_scans mirrors
-- variables' member/readonly split for the same reason audit_logs is
-- insert-only: a scan result is a historical record, not something meant to
-- be edited after the fact, so no update policy exists for it either.

-- ===========================================================================
-- Helper functions
-- ===========================================================================

-- Explicitly requested by the phase prompt. SECURITY DEFINER is required,
-- not just style: this function is called from inside RLS policies on
-- team_members itself (among other tables), and a plain invoker-rights
-- function would recursively re-apply team_members' own SELECT policy to
-- its internal query, which needs team_members' own SELECT policy to call
-- this function to evaluate — infinite recursion. Running as definer (the
-- table owner) bypasses RLS for this one internal lookup and breaks that
-- cycle. `set search_path` pins it against search_path hijacking, same as
-- Phase 7's handle_new_user().
--
-- team_role's declaration order (admin, member, readonly) doubles as a
-- privilege rank: admin sorts first/lowest, readonly last/highest. So "at
-- least as privileged as p_min_role" is simply "role <= p_min_role" — not
-- obvious from the name alone, hence this comment.
create function public.is_team_member(
  p_team_id uuid,
  p_user_id uuid,
  p_min_role public.team_role default 'readonly'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = p_user_id
      and tm.role <= p_min_role
  );
$$;

-- Not explicitly requested by the phase prompt — only is_team_member was.
-- environments/variables/security_scans policies all need to resolve a
-- team_id through one or two joins (environment -> project -> team). These
-- two small resolvers keep that join logic in one place instead of
-- repeating an exists(...) subquery across every policy on those three
-- tables. Same SECURITY DEFINER/search_path reasoning as is_team_member.
create function public.project_team_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.projects where id = p_project_id;
$$;

create function public.environment_team_id(p_environment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id
  from public.environments e
  join public.projects p on p.id = e.project_id
  where e.id = p_environment_id;
$$;

-- ===========================================================================
-- teams
-- ===========================================================================

alter table public.teams enable row level security;

create policy "Members can view their teams"
  on public.teams for select
  to authenticated
  using (public.is_team_member(id, auth.uid(), 'readonly'));

-- No membership row can exist yet for a team that doesn't exist yet, so
-- team creation can't be gated on is_team_member — any authenticated user
-- may create a team, attributed to themselves. Phase 13 is responsible for
-- immediately inserting the creator's own admin team_members row after
-- this insert (see the bootstrap clause on that policy below). Until that
-- second insert happens, note this INSERT's own RETURNING projection won't
-- satisfy the SELECT policy above (no membership row exists yet) — Phase
-- 13 should insert both rows before reading the team back, not rely on
-- this statement's RETURNING to reflect the final state.
create policy "Authenticated users can create teams"
  on public.teams for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Admins can update their team"
  on public.teams for update
  to authenticated
  using (public.is_team_member(id, auth.uid(), 'admin'))
  with check (public.is_team_member(id, auth.uid(), 'admin'));

create policy "Admins can delete their team"
  on public.teams for delete
  to authenticated
  using (public.is_team_member(id, auth.uid(), 'admin'));

-- ===========================================================================
-- team_members
-- ===========================================================================

alter table public.team_members enable row level security;

create policy "Members can view their team's membership rows"
  on public.team_members for select
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'readonly'));

-- Same bootstrap problem as team creation: "only admins can insert members"
-- can never fire for a team's very first member, since nobody is an admin
-- of a team with zero members yet. The second clause below allows exactly
-- one narrow exception — the team's own creator, inserting themselves as
-- that team's first admin, only while the team has no members at all —
-- and nothing else. Every subsequent invite (Phase 14) must go through the
-- first clause (an existing admin adding someone).
create policy "Admins can add members, or a creator can bootstrap the first admin"
  on public.team_members for insert
  to authenticated
  with check (
    public.is_team_member(team_id, auth.uid(), 'admin')
    or (
      user_id = auth.uid()
      and role = 'admin'
      and not exists (
        select 1 from public.team_members existing
        where existing.team_id = team_members.team_id
      )
      and exists (
        select 1 from public.teams t
        where t.id = team_members.team_id and t.created_by = auth.uid()
      )
    )
  );

create policy "Admins can update member roles"
  on public.team_members for update
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'admin'))
  with check (public.is_team_member(team_id, auth.uid(), 'admin'));

create policy "Admins can remove members"
  on public.team_members for delete
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'admin'));

-- ===========================================================================
-- projects
-- ===========================================================================

alter table public.projects enable row level security;

create policy "Members can view their team's projects"
  on public.projects for select
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'readonly'));

create policy "Admins can create projects"
  on public.projects for insert
  to authenticated
  with check (public.is_team_member(team_id, auth.uid(), 'admin'));

create policy "Admins can update projects"
  on public.projects for update
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'admin'))
  with check (public.is_team_member(team_id, auth.uid(), 'admin'));

create policy "Admins can delete projects"
  on public.projects for delete
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'admin'));

-- ===========================================================================
-- environments
-- ===========================================================================

alter table public.environments enable row level security;

create policy "Members can view their project's environments"
  on public.environments for select
  to authenticated
  using (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'readonly'));

create policy "Admins can create environments"
  on public.environments for insert
  to authenticated
  with check (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'admin'));

create policy "Admins can update environments"
  on public.environments for update
  to authenticated
  using (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'admin'))
  with check (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'admin'));

create policy "Admins can delete environments"
  on public.environments for delete
  to authenticated
  using (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'admin'));

-- ===========================================================================
-- variables
-- ===========================================================================

alter table public.variables enable row level security;

create policy "Members can view their project's variables"
  on public.variables for select
  to authenticated
  using (public.is_team_member(public.environment_team_id(environment_id), auth.uid(), 'readonly'));

create policy "Members can create variables"
  on public.variables for insert
  to authenticated
  with check (public.is_team_member(public.environment_team_id(environment_id), auth.uid(), 'member'));

create policy "Members can update variables"
  on public.variables for update
  to authenticated
  using (public.is_team_member(public.environment_team_id(environment_id), auth.uid(), 'member'))
  with check (public.is_team_member(public.environment_team_id(environment_id), auth.uid(), 'member'));

create policy "Members can delete variables"
  on public.variables for delete
  to authenticated
  using (public.is_team_member(public.environment_team_id(environment_id), auth.uid(), 'member'));

-- ===========================================================================
-- audit_logs — insert-and-read only, never updatable or deletable by anyone
-- (no update/delete policy is written, on purpose: with RLS enabled and
-- zero matching policies for a command, Postgres denies that command
-- outright, for every role including admins — the strongest form of
-- "never", short of revoking table privileges entirely).
-- ===========================================================================

alter table public.audit_logs enable row level security;

create policy "Members can view their team's audit logs"
  on public.audit_logs for select
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'readonly'));

-- Any role (including readonly) can insert, since "read" is itself an
-- audited action per the phase notes — a readonly member's own reads still
-- need to be logged. user_id must match the caller so nobody can attribute
-- a log entry to someone else.
create policy "Members can log their own actions"
  on public.audit_logs for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_team_member(team_id, auth.uid(), 'readonly')
  );

-- ===========================================================================
-- security_scans — not named in the phase's rule text, but every
-- application table needs policies. Mirrors variables' member/readonly
-- split (running a scan is a "write"; viewing results is a "read"), and
-- like audit_logs, has no update policy — a scan is a point-in-time result,
-- not something meant to be edited after the fact. No delete policy either:
-- nothing in the plan calls for removing scan history.
-- ===========================================================================

alter table public.security_scans enable row level security;

create policy "Members can view their project's security scans"
  on public.security_scans for select
  to authenticated
  using (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'readonly'));

create policy "Members can record security scans"
  on public.security_scans for insert
  to authenticated
  with check (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'member'));
