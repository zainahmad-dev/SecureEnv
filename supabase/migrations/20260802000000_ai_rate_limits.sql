-- Phase 37: per-user rate limiting for AI endpoints. Fixed hourly windows,
-- not a sliding window or token bucket — the simplest correct thing at
-- portfolio scale, and the (user_id, window_start) primary key turns the
-- increment into a single atomic upsert with no separate lock or cleanup
-- job needed. Old rows are cheap to leave; a scheduled prune could be added
-- later if this ever ran at real scale.
create table public.ai_rate_limit_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (user_id, window_start)
);

alter table public.ai_rate_limit_windows enable row level security;

-- No SELECT/INSERT/UPDATE policies for authenticated or anon at all — every
-- access goes through increment_ai_rate_limit() below, which is SECURITY
-- DEFINER and keys strictly off auth.uid(), never a client-supplied id. A
-- user has no legitimate reason to read or write this table directly, only
-- to have their own usage counted by the function.

comment on table public.ai_rate_limit_windows is
  'Per-user, per-hour AI call counts. Written only via increment_ai_rate_limit(); never contains prompt or response content, only counts.';

create or replace function public.increment_ai_rate_limit(p_window_start timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.ai_rate_limit_windows (user_id, window_start, request_count)
  values (auth.uid(), p_window_start, 1)
  on conflict (user_id, window_start)
  do update set request_count = ai_rate_limit_windows.request_count + 1
  returning request_count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_ai_rate_limit(timestamptz) from public;
grant execute on function public.increment_ai_rate_limit(timestamptz) to authenticated;
