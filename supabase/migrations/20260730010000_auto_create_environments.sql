-- Phase 18: every new project gets development/staging/production automatically,
-- plus the rules for adding, renaming, and deleting environments afterwards.

-- ===========================================================================
-- Environments become admin-or-member to insert, same reasoning as Phase 17's
-- projects change.
-- ===========================================================================

-- This isn't optional for Phase 18: create_project() below inserts a project
-- row AND its three environment rows in one transaction, as whichever role
-- created the project (Phase 17 already allows members to do that). If
-- environments stayed admin-only to insert, a member's project creation
-- would insert the project, then fail on the environment inserts and roll
-- the whole thing back — members would be unable to create projects at all
-- despite Phase 17's policy saying they can. Once this is open in general,
-- it's also consistent to let members add a later custom environment the
-- same way they created the project.
drop policy "Admins can create environments" on public.environments;

create policy "Admins and members can create environments"
  on public.environments for insert
  to authenticated
  with check (public.is_team_member(public.project_team_id(project_id), auth.uid(), 'member'));

-- ===========================================================================
-- create_project(): project + its three default environments, one transaction
-- ===========================================================================

-- SECURITY INVOKER, like create_team() — relies entirely on the two INSERT
-- policies above rather than duplicating their authorization logic. If the
-- environment inserts fail for any reason, the project insert rolls back
-- with them; there is no path to a project with fewer than three
-- environments.
--
-- Unlike create_team()'s teams insert, `returning * into new_project` is
-- safe here: RLS's RETURNING behaviour re-checks the table's SELECT policy,
-- and create_team() avoided it because a brand-new team has zero
-- team_members rows at that instant, so its own SELECT policy would fail.
-- Here, team_id refers to a team the caller already belongs to (checked by
-- this very statement's WITH CHECK) — that membership predates this call,
-- so the SELECT policy is already satisfied.
create function public.create_project(
  p_team_id uuid,
  p_name text,
  p_description text default null
)
returns public.projects
language plpgsql
security invoker
as $$
declare
  new_project public.projects;
begin
  insert into public.projects (team_id, name, description, created_by)
  values (p_team_id, p_name, p_description, auth.uid())
  returning * into new_project;

  insert into public.environments (project_id, name, sort_order)
  values
    (new_project.id, 'development', 0),
    (new_project.id, 'staging', 1),
    (new_project.id, 'production', 2);

  return new_project;
end;
$$;

-- ===========================================================================
-- The three default environments can never be renamed or deleted
-- ===========================================================================

-- No unique-name gaming is possible here: the three default names are
-- claimed the instant a project is created (above), the (project_id, name)
-- unique constraint means nothing else can ever take those names in the
-- same project, and these triggers mean they can never be freed up by a
-- rename or delete either. So checking OLD.name against the three literal
-- strings is sufficient to identify "one of the originals" — no separate
-- is_default column is needed.
create function public.prevent_default_environment_rename()
returns trigger
language plpgsql
as $$
begin
  if old.name in ('development', 'staging', 'production') and new.name is distinct from old.name then
    raise exception 'The default environments (development, staging, production) can''t be renamed.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger environments_prevent_default_rename
  before update on public.environments
  for each row
  execute function public.prevent_default_environment_rename();

-- No SECURITY DEFINER on either trigger function: unlike Phase 15's last-admin
-- trigger, nothing here depends on a query whose result could be wrong under
-- RLS — the rename check only reads OLD/NEW of the row already being
-- touched, and the delete check's existence probe below is correct under
-- invoker rights for the same reason explained inline.
create function public.prevent_default_environment_delete()
returns trigger
language plpgsql
as $$
begin
  -- Cascade safety, same shape as Phase 15's last-admin trigger: deleting a
  -- project cascades to delete its environments, and Postgres removes the
  -- parent row before the cascade fires — so if the project is already gone,
  -- this is a cascade, not someone deleting a default environment on its
  -- own, and must be allowed through. (The admin who could reach this delete
  -- at all was necessarily a member of the project's team, so if the project
  -- still exists they can still see it — this check is correct under invoker
  -- rights without needing to bypass RLS.)
  if not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;

  if old.name in ('development', 'staging', 'production') then
    raise exception 'The default environments (development, staging, production) can''t be deleted.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

create trigger environments_prevent_default_delete
  before delete on public.environments
  for each row
  execute function public.prevent_default_environment_delete();
