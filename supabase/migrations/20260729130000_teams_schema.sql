-- Phase 8: teams and team membership.
--
-- Row Level Security for these tables is intentionally NOT added here — it's
-- Phase 11's job, and the build plan explicitly orders Phase 11 before Phase
-- 13 (create a team) so RLS never has to be retrofitted onto live team data.
-- Until Phase 11 lands, only the service-role client should touch these
-- tables.

create type public.team_role as enum ('admin', 'member', 'readonly');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.team_role not null default 'member',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- FK indexes. (team_id, user_id) is already covered by the unique constraint
-- above, which btree-indexes team_id as its leading column — a standalone
-- user_id index is still needed for the reverse lookup ("which teams is this
-- user in", the team switcher's core query).
create index teams_created_by_idx on public.teams (created_by);
create index team_members_user_id_idx on public.team_members (user_id);
create index team_members_invited_by_idx on public.team_members (invited_by);
