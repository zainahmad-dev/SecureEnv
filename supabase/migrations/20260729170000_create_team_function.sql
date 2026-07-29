-- Phase 13: atomic team creation.
--
-- "The creator is inserted as an admin in team_members in the same
-- transaction" — a team with no admin is an orphaned row nobody can manage
-- or delete. The Supabase JS client can't span a transaction across two
-- separate .from() calls (each is its own request), so this needs to be a
-- single Postgres function call: one RPC invocation is one implicit
-- transaction, so if the second insert fails, the first rolls back too.
--
-- security invoker (the default, stated explicitly for contrast with this
-- migration's earlier SECURITY DEFINER helpers): this function performs no
-- authorization of its own for the two inserts. It relies entirely on the
-- INSERT policies already written in Phase 11 (as patched by
-- 20260729180000_fix_team_bootstrap_policy.sql) — so there's no duplicate
-- authorization logic to keep in sync with those policies.
--
-- The id/created_at are generated here, up front, rather than read back via
-- `insert ... returning ... into` on the teams row. RLS applies its SELECT
-- policy to INSERT...RETURNING output, and this team has zero members at
-- the point the teams row is inserted (that's the next statement) — so
-- reading it back that way is exactly the same bootstrap trap the
-- team_members policy had, just one table over. Building the return value
-- from values this function already holds sidesteps the question entirely
-- instead of depending on exactly how that interaction behaves.
create function public.create_team(p_name text, p_slug text)
returns public.teams
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_team_id uuid := gen_random_uuid();
  new_created_at timestamptz := now();
begin
  insert into public.teams (id, name, slug, created_by, created_at)
  values (new_team_id, p_name, p_slug, auth.uid(), new_created_at);

  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, auth.uid(), 'admin');

  return (new_team_id, p_name, p_slug, auth.uid(), new_created_at)::public.teams;
end;
$$;
