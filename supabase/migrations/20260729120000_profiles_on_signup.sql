-- Phase 7: a profiles row is created automatically for every new auth user.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_initials text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policy: rows are created only by the trigger below (which
-- runs as the table owner and so isn't subject to these policies) and removed
-- only via the auth.users cascade.

-- Takes either a display name or a bare email local-part and returns up to
-- two uppercase initials, e.g. "Jane Doe" -> "JD", "jane.doe@x.com" -> "JD".
create function public.derive_initials(source text)
returns text
language plpgsql
immutable
as $$
declare
  local_part text;
  parts text[];
  initials text := '';
  part text;
begin
  if source is null or trim(source) = '' then
    return '??';
  end if;

  local_part := split_part(trim(source), '@', 1);
  parts := regexp_split_to_array(local_part, '[\s._-]+');

  foreach part in array parts loop
    if length(part) > 0 then
      initials := initials || upper(left(part, 1));
    end if;
    if length(initials) >= 2 then
      exit;
    end if;
  end loop;

  if length(initials) = 0 then
    return '??';
  elsif length(initials) = 1 then
    return upper(left(local_part, 2));
  end if;

  return initials;
end;
$$;

-- security definer: this must insert into public.profiles regardless of which
-- role fires the auth.users insert, and it runs before any session/JWT exists
-- for the new user, so it can't rely on the caller's own privileges.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provided_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  insert into public.profiles (id, display_name, avatar_initials)
  values (
    new.id,
    provided_name,
    public.derive_initials(coalesce(provided_name, new.email))
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
