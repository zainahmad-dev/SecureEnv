-- Phase 16: remembers which team a user was last on, so their next login
-- lands there instead of always Phase 13's "earliest-joined team" fallback.
--
-- Stored on profiles rather than a browser cookie: "next login" should work
-- from any device the user signs in on, not just the one that set it, and
-- profiles is already where a user's own preferences live.
--
-- last_team_id is deliberately never treated as an authorization value —
-- nothing reads it to decide what a user may do, only where to send them.
-- lib/teams/queries.ts's getLandingTeamSlug() re-resolves it through teams'
-- own SELECT policy before trusting it, so a stale value (the user left, or
-- was removed from, that team) or a value pointing at a team they were never
-- on just falls straight through to the ordinary fallback. That's what makes
-- it safe to leave unconstrained here: a user pointing their own preference
-- at an arbitrary team id is harmless.
alter table public.profiles
  add column last_team_id uuid references public.teams (id) on delete set null;

-- Incidental hardening while this column is being added, not scope creep:
-- Phase 7's self-update policy has never had a column restriction, which
-- means a user could already update their own created_at (or id, though the
-- primary key makes that one harmless in practice) via a raw PostgREST call.
-- Phases 14 and 15 established column-level grants as this project's answer
-- to exactly this shape of gap (RLS decides rows, not columns), so the same
-- fix is applied here rather than left for a later phase to rediscover.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_initials, last_team_id) on public.profiles to authenticated;
