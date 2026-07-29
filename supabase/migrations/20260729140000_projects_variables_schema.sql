-- Phase 9: project hierarchy (project -> environment -> variable).
--
-- No plaintext value column anywhere, by design (non-negotiable rule #1).
-- encrypted_value/encrypted_dek/iv/auth_tag are all separately stored,
-- base64-encoded text: AES-256-GCM needs the IV and auth tag alongside the
-- ciphertext to decrypt and verify, so storing only the ciphertext would
-- make the data unrecoverable.
--
-- RLS is still deferred to Phase 11, same as Phase 8's teams/team_members.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.variables (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments (id) on delete cascade,
  key text not null,
  encrypted_value text not null,
  encrypted_dek text not null,
  iv text not null,
  auth_tag text not null,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (environment_id, key)
);

-- FK indexes. environments(project_id) and variables(environment_id) are
-- already the leading column of this table's own unique constraint above, so
-- a standalone index would be redundant — same reasoning as team_members in
-- Phase 8's migration.
create index projects_team_id_idx on public.projects (team_id);
create index projects_created_by_idx on public.projects (created_by);
create index variables_created_by_idx on public.variables (created_by);
create index variables_updated_by_idx on public.variables (updated_by);
