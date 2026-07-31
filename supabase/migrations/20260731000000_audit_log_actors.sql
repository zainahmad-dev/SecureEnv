-- Phase 30: resolves display email/name for arbitrary audit_logs.user_id
-- values, including people who have since left the team. audit_logs.user_id
-- only goes null when the auth.users row itself is deleted (on delete set
-- null) — leaving a team doesn't touch it, so a former member's old rows
-- still carry a real, resolvable id. get_team_members() (Phase 15) only
-- returns *current* members, which would silently blank out exactly the
-- audit rows where knowing who acted matters most (someone who did
-- something, then left). This needs its own definer function reaching
-- auth.users directly, for an arbitrary set of ids rather than "whoever is
-- on the team right now".
create function public.get_audit_log_actors(p_team_id uuid, p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    p.display_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = any(p_user_ids)
    and public.is_team_member(p_team_id, auth.uid(), 'readonly');
$$;

-- Same reasoning as team_has_member_with_email (Phase 14): the membership
-- check is ANDed into the query itself, not raised as an error, so a
-- non-member calling this for any team id simply gets zero rows back —
-- useless as an oracle, no separate error branch to get wrong.
grant execute on function public.get_audit_log_actors(uuid, uuid[]) to authenticated;
