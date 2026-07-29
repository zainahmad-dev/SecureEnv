-- Phase 10: audit trail and security-scan history.
--
-- RLS is still deferred to Phase 11 — audit_logs specifically will get
-- insert-and-read-only policies there (never updatable/deletable by anyone),
-- per the plan's Phase 11 rules.

create type public.audit_action as enum (
  'create',
  'read',
  'update',
  'delete',
  'permission_change',
  'invite'
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action public.audit_action not null,
  -- target_type/target_id are a polymorphic reference (team, project,
  -- environment, variable, team_member, ...) and deliberately have no FK
  -- constraint, since target_id's referenced table varies with target_type.
  target_type text not null,
  target_id uuid not null,
  environment_id uuid references public.environments (id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Non-negotiable: metadata must never contain a secret value (plaintext or
-- encrypted). It's for context like {"key": "API_KEY", "environment": "prod"}
-- — never encrypted_value, encrypted_dek, iv, or auth_tag. Enforced by
-- application code, not a DB constraint, since jsonb shape isn't statically
-- checkable here; this comment is the durable reminder for anyone writing
-- to this table, including from Supabase Studio's schema view.
comment on column public.audit_logs.metadata is
  'Context only — must never contain a secret value (plaintext or encrypted). E.g. {"key": "API_KEY"} is fine, encrypted_value/encrypted_dek/iv/auth_tag are not.';

create table public.security_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  environment_id uuid not null references public.environments (id) on delete cascade,
  score integer not null,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Explicitly required: fast recent-activity queries per team.
create index audit_logs_team_id_created_at_idx
  on public.audit_logs (team_id, created_at desc);

-- Remaining FK indexes.
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_environment_id_idx on public.audit_logs (environment_id);
create index security_scans_project_id_idx on public.security_scans (project_id);
create index security_scans_environment_id_idx on public.security_scans (environment_id);
