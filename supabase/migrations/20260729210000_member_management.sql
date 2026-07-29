-- Phase 15: the members screen, and the rules that protect a team from losing
-- its last admin.
--
-- Two problems this solves, both of which have to live in the database rather
-- than in the server action that happens to call it:
--
--   1. The screen has to show each member's email. Emails live in auth.users,
--      which no ordinary client can read, and duplicating them into
--      public.profiles would mean keeping a copy in sync with the authoritative
--      row forever. A guarded read-only function is the smaller commitment.
--   2. "You can't remove or demote the last admin" is a rule about the whole
--      team, not about one row, so no RLS policy can express it — a policy sees
--      only the row being touched. A trigger sees the table.

-- ===========================================================================
-- Reading the members list
-- ===========================================================================

-- SECURITY DEFINER purely to reach auth.users for the email. Membership is
-- re-checked inside the query rather than assumed from the caller having a
-- team id: a non-member gets zero rows, exactly as they would from a direct
-- select against team_members under RLS.
--
-- profiles is LEFT joined even though the Phase 7 trigger creates a row for
-- every user — a members list that silently drops people because one profile
-- row is missing would be a worse failure than showing '??' for initials.
create function public.get_team_members(p_team_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  role public.team_role,
  joined_at timestamptz,
  display_name text,
  avatar_initials text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tm.id,
    tm.user_id,
    tm.role,
    tm.created_at,
    p.display_name,
    coalesce(p.avatar_initials, '??'),
    u.email::text
  from public.team_members tm
  left join public.profiles p on p.id = tm.user_id
  left join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and public.is_team_member(p_team_id, auth.uid(), 'readonly')
  order by tm.created_at asc;
$$;

-- ===========================================================================
-- Column-level UPDATE privilege
-- ===========================================================================

-- Phase 11's "Admins can update member roles" policy is about which *rows* an
-- admin may update; it has nothing to say about which columns. Without this,
-- that policy also lets an admin repoint a membership row's user_id at someone
-- else, or move it to another team they administer — neither of which is a
-- role change. role is the only column that should ever move.
--
-- Insert is untouched: create_team() and accept_team_invite() both write full
-- rows, and both are already gated (by Phase 11's bootstrap clause and by the
-- invite token respectively).
revoke update on public.team_members from anon, authenticated;
grant update (role) on public.team_members to authenticated;

-- ===========================================================================
-- The last-admin rule
-- ===========================================================================

-- Enforced as a trigger, not in the server action, so it holds for every path
-- into the table — the members screen, a raw PostgREST call from a signed-in
-- admin's browser console, or a future script. The action does its own check
-- first only so the user gets a sentence instead of a database error; this is
-- what makes the rule true.
--
-- SECURITY DEFINER for the admin count: under invoker rights the count would be
-- silently filtered by team_members' own SELECT policy, which is the trap
-- documented in 20260729180000_fix_team_bootstrap_policy.sql. Here it would
-- read "admins I can see" — and a caller who can see none would be told the
-- team has no admins to protect.
--
-- The two early exits are what keep cascading deletes working. Postgres
-- implements ON DELETE CASCADE by deleting the parent row first and then the
-- referencing rows, so by the time this fires for a cascade the parent is
-- already gone:
--   - deleting a team must still delete its memberships, admin or not
--   - deleting a user account must still delete their memberships, even if
--     they were the only admin of some team
-- Without these, `delete from teams` would fail on its own admin's row.
create function public.prevent_last_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.team_members;
  v_admin_count integer;
begin
  if tg_op = 'DELETE' then
    v_result := old;
  else
    v_result := new;
  end if;

  if not exists (select 1 from public.teams where id = old.team_id) then
    return v_result;
  end if;

  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id) then
    return v_result;
  end if;

  -- Only losing an admin can strand a team.
  if old.role <> 'admin' then
    return v_result;
  end if;

  if tg_op = 'UPDATE' and new.role = 'admin' then
    return v_result;
  end if;

  select count(*) into v_admin_count
  from public.team_members
  where team_id = old.team_id
    and role = 'admin';

  if v_admin_count <= 1 then
    -- P0001 (raise_exception) is what PostgREST turns into a 400 with the
    -- message intact, so lib/teams/member-actions.ts can recognise this case
    -- from error.code rather than by matching on wording.
    raise exception
      'A team must always have at least one admin. Make someone else an admin first.'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create trigger team_members_protect_last_admin
  before update or delete on public.team_members
  for each row
  execute function public.prevent_last_admin_change();
