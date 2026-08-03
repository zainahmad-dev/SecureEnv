-- Phase 43: Demo mode.
--
-- A public, shared, read-only account anyone can log into with one click.
-- The whole risk of that feature is in one sentence: this account's
-- credentials are effectively public, so "read-only" has to be true at the
-- database level, not in the UI and not in the server actions.
--
-- The mechanism is RESTRICTIVE row level security. Every policy this project
-- has written so far is PERMISSIVE — Postgres ORs them together, so adding
-- another one can only ever *widen* access. A RESTRICTIVE policy is ANDed
-- with the permissive set instead, so a single one per table per command
-- subtracts from whatever every existing policy allows, without editing any
-- of them. That property is what makes this safe to add at Phase 43 rather
-- than something that needed designing in Phase 11: it cannot loosen an
-- existing rule by accident, and a future permissive policy added by a later
-- phase is automatically covered too.
--
-- SELECT is deliberately untouched — a demo account that can't read anything
-- has nothing to demo.

-- ===========================================================================
-- Marking the demo account
-- ===========================================================================

-- Not an env var or a hardcoded email: the flag has to be readable from
-- inside an RLS policy, and a policy can't see the application's
-- environment. A column on profiles is the only thing SQL can check.
--
-- Note what is NOT needed here: a grant. Phase 16 already replaced the
-- blanket `update on profiles` grant with a column list
-- (display_name, avatar_initials, last_team_id), so a column added now is
-- un-writable by the `authenticated` role by construction. A demo visitor
-- cannot clear their own demo flag, and neither can anyone else.
alter table public.profiles
  add column is_demo boolean not null default false;

comment on column public.profiles.is_demo is
  'True only for the shared public demo account (Phase 43). Set by the seed/reset scripts via the service role; not writable by any client. Every RESTRICTIVE policy below reads it through is_demo_user().';

-- SECURITY DEFINER for the same reason is_team_member() is: this is called
-- from inside policies on profiles itself, and an invoker-rights version
-- would re-apply profiles' own SELECT policy to its internal lookup — the
-- recursion trap this project has already hit once (Phase 13). `stable` so
-- the planner can call it once per statement rather than once per row.
--
-- Defaults to auth.uid() so policies read as `not public.is_demo_user()`
-- with no argument. A null p_user_id (no session) coalesces to false: anon
-- writes are already blocked by the permissive policies, and this function
-- should never be the thing that decides that.
create function public.is_demo_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_demo from public.profiles where id = p_user_id), false);
$$;

-- ===========================================================================
-- The restriction itself
-- ===========================================================================

-- Written as a loop rather than 24 hand-copied policies. Every one of them
-- would be character-for-character identical except for the table name, and
-- a hand-copied list is exactly where a table gets silently missed — the
-- failure mode here being "the public demo account can write to that one
-- table", which is not a failure mode worth risking for readability.
--
-- audit_logs is deliberately absent from this list. See below.
do $$
declare
  target text;
begin
  foreach target in array array[
    'teams',
    'team_members',
    'team_invites',
    'projects',
    'environments',
    'variables',
    'security_scans',
    'profiles'
  ]
  loop
    execute format(
      'create policy "Demo accounts cannot insert" on public.%I '
      'as restrictive for insert to authenticated '
      'with check (not public.is_demo_user())',
      target
    );

    execute format(
      'create policy "Demo accounts cannot update" on public.%I '
      'as restrictive for update to authenticated '
      'using (not public.is_demo_user())',
      target
    );

    execute format(
      'create policy "Demo accounts cannot delete" on public.%I '
      'as restrictive for delete to authenticated '
      'using (not public.is_demo_user())',
      target
    );
  end loop;
end
$$;

-- ===========================================================================
-- Why audit_logs is exempt
-- ===========================================================================
--
-- Revealing a secret is a *read*, and a demo visitor is meant to be able to
-- do it — it's the product's headline interaction. But the point of this
-- product is that a reveal is a read *that gets written down*. Blocking the
-- audit insert would leave the demo showing a redaction bar that opens and
-- an activity feed that never mentions it, which demonstrates the opposite
-- of the claim being made.
--
-- So the demo account keeps its INSERT on audit_logs, and the existing
-- permissive policy from Phase 11 already bounds it tightly: the row must
-- carry `user_id = auth.uid()` and a team the caller belongs to. The demo
-- account can therefore only ever append true statements about its own
-- activity to one team's ledger. There is no UPDATE or DELETE policy on
-- audit_logs for anyone, demo or not, so the ledger stays append-only.
--
-- The growth this allows is real but bounded and self-cleaning: the reset
-- routine (lib/demo/reset.ts) truncates the demo team's audit rows on every
-- run.

comment on function public.is_demo_user is
  'True if the given user (default: the current session) is the shared public demo account. Read by the RESTRICTIVE policies added in Phase 43, which block every INSERT/UPDATE/DELETE for that account on every table except audit_logs.';
