-- Phase 14: team invitations.
--
-- Token model — the plaintext invite token is NEVER stored. The app generates
-- 32 random bytes, hands the base64url form to the inviting admin as part of a
-- one-time link, and stores only an HMAC-SHA256 digest of it (keyed with the
-- server-side INVITE_TOKEN_SECRET) in token_hash. Two consequences worth
-- stating, since they drive the rest of this file:
--
--   1. A database leak alone (backup, read-replica, stray SQL access) yields no
--      usable invite links: an attacker would need the app's HMAC key as well,
--      and a bare digest can't be replayed against get_invite_preview or
--      accept_team_invite without the key that produced it. That's why this is
--      a keyed HMAC and not a plain sha256 — an unkeyed digest of a token would
--      be brute-forceable from the database alone if the token space were ever
--      narrowed.
--   2. A link cannot be re-displayed after the fact, by anyone, including us.
--      Losing it means revoking the invite and issuing a new one. That's the
--      intended trade, and the UI says so at the point the link is shown.
--
-- This mirrors the project's standing rule that there is no plaintext column
-- for anything secret — an invite token is a bearer credential for joining a
-- team, so it gets the same treatment as a secret value.

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  role public.team_role not null default 'member',
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  -- Enforced rather than merely conventional: the pending-invite unique index
  -- below is on the raw email column, so a stray mixed-case row would silently
  -- defeat it and allow two live invites for what is really one address.
  constraint team_invites_email_is_lowercase check (email = lower(email))
);

comment on column public.team_invites.token_hash is
  'HMAC-SHA256 digest of the invite token, keyed with the server-side INVITE_TOKEN_SECRET. The plaintext token is never stored, so an invite link cannot be recovered from this table.';

-- invited_by/accepted_by are attribution: losing the account shouldn't delete
-- the invite record (same reasoning as teams.created_by in Phase 8). team_id
-- cascades — an invite to a deleted team is unusable by construction.

-- At most one live invite per address per team. Scoped to pending rows so an
-- address can be re-invited after the previous invite is accepted or revoked;
-- lib/invites/actions.ts revokes any existing pending invite before inserting a
-- replacement, and this index is what makes that safe under concurrency.
create unique index team_invites_pending_email_idx
  on public.team_invites (team_id, email)
  where accepted_at is null and revoked_at is null;

-- Not redundant with the partial index above, despite sharing its leading
-- column: that one only covers pending rows, so it can't serve a query over a
-- team's full invite history (Phase 30's audit screen, or any "was this address
-- ever invited" question).
create index team_invites_team_id_idx on public.team_invites (team_id);
create index team_invites_invited_by_idx on public.team_invites (invited_by);
create index team_invites_accepted_by_idx on public.team_invites (accepted_by);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.team_invites enable row level security;

-- Any team member can see their team's pending invites — the members screen
-- shows them to everyone and the revoke control only to admins, matching how
-- Phase 15 treats the members list itself (read-only for non-admins).
create policy "Members can view their team's invites"
  on public.team_invites for select
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'readonly'));

-- Only admins invite, only in their own name, and only in a pending state — a
-- row can't be born pre-accepted, which would otherwise be a way to fabricate
-- an acceptance record for someone who never clicked anything.
create policy "Admins can create invites"
  on public.team_invites for insert
  to authenticated
  with check (
    public.is_team_member(team_id, auth.uid(), 'admin')
    and invited_by = auth.uid()
    and accepted_at is null
    and accepted_by is null
    and revoked_at is null
  );

create policy "Admins can revoke invites"
  on public.team_invites for update
  to authenticated
  using (public.is_team_member(team_id, auth.uid(), 'admin'))
  with check (public.is_team_member(team_id, auth.uid(), 'admin'));

-- No delete policy, on purpose: with RLS on and no policy for a command,
-- Postgres denies it outright. Revoking is a state change (revoked_at), so the
-- record of who invited whom survives — same reasoning as audit_logs in Phase
-- 11 being insert-and-read only.

-- ===========================================================================
-- Column-level privileges — the part RLS policies can't express
-- ===========================================================================

-- RLS decides which *rows* a caller sees; it has no say over which *columns*.
-- Two things need column granularity here, so they're done with grants:
--
--   1. token_hash must never be selectable by an ordinary client. It isn't the
--      token and can't be reversed into one, but a team member reading a
--      pending invite's digest could replay it straight at accept_team_invite,
--      and the only thing standing between them and someone else's invite
--      would be that function's email check. Removing the column from every
--      non-service-role read removes that whole line of attack instead of
--      relying on one downstream check to hold.
--   2. The only column an authenticated caller may UPDATE is revoked_at. The
--      policy above can't say "admins may revoke but not backdate an
--      acceptance" — a column grant can. Acceptance is written solely by
--      accept_team_invite() below, which runs as the table owner.
revoke all on public.team_invites from anon;
revoke select, update on public.team_invites from authenticated;

grant select (
  id, team_id, email, role, invited_by,
  expires_at, accepted_at, accepted_by, revoked_at, created_at
) on public.team_invites to authenticated;

grant update (revoked_at) on public.team_invites to authenticated;

-- ===========================================================================
-- Invite lifecycle functions
-- ===========================================================================

-- "Prevent duplicate memberships" starts at invite time: an admin shouldn't be
-- able to send an invite to someone who is already on the team. Answering that
-- needs auth.users (emails live there, not in public.profiles), which no
-- ordinary client can read — hence SECURITY DEFINER.
--
-- The admin check is folded into the returned expression rather than raised as
-- an error: SQL doesn't guarantee AND short-circuits, so this deliberately
-- returns plain false for a non-admin whether or not the address matches,
-- making the function useless as a membership oracle for anyone who isn't
-- already entitled to see that team's members.
create function public.team_has_member_with_email(p_team_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_team_member(p_team_id, auth.uid(), 'admin')
    and exists (
      select 1
      from public.team_members tm
      join auth.users u on u.id = tm.user_id
      where tm.team_id = p_team_id
        and lower(u.email) = lower(p_email)
    );
$$;

create type public.invite_preview as (
  status text,
  team_name text,
  email text,
  role public.team_role,
  expires_at timestamptz
);

-- The accept page has to render for a visitor with no account and no session
-- at all, so it can't read team_invites through RLS (which grants nothing to
-- anon, by design). This definer function is the one narrow hole: given a
-- token digest, it returns just enough to explain the invitation — team name,
-- the address it was sent to, the offered role — and nothing else. Possession
-- of the token is the authorization, which is what an invite link is.
--
-- Every failure mode is a distinct status rather than a null return, so the
-- page can say "this invite expired" instead of the uselessly vague "invalid
-- link" for four different situations.
create function public.get_invite_preview(p_token_hash text)
returns public.invite_preview
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite public.team_invites;
  v_team_name text;
begin
  select * into v_invite from public.team_invites where token_hash = p_token_hash;

  if not found then
    return ('invalid', null, null, null, null)::public.invite_preview;
  end if;

  select name into v_team_name from public.teams where id = v_invite.team_id;

  if v_invite.revoked_at is not null then
    return ('revoked', v_team_name, v_invite.email, v_invite.role, v_invite.expires_at)::public.invite_preview;
  end if;

  if v_invite.accepted_at is not null then
    return ('used', v_team_name, v_invite.email, v_invite.role, v_invite.expires_at)::public.invite_preview;
  end if;

  if v_invite.expires_at <= now() then
    return ('expired', v_team_name, v_invite.email, v_invite.role, v_invite.expires_at)::public.invite_preview;
  end if;

  return ('valid', v_team_name, v_invite.email, v_invite.role, v_invite.expires_at)::public.invite_preview;
end;
$$;

-- Anonymous execution is the point of this one: the invited person hasn't
-- signed up yet the first time they open the link.
grant execute on function public.get_invite_preview(text) to anon, authenticated;

create type public.accept_invite_result as (
  status text,
  team_slug text,
  team_name text
);

-- Accepting is the one place a user legitimately adds *themselves* to a team
-- they have no relationship with yet, which Phase 11's team_members INSERT
-- policy flatly forbids (admins add members; the only exception is a team's
-- own creator bootstrapping themselves). The invite token is the missing
-- authorization, and it can only be checked by code that can read token_hash —
-- so this runs as definer and does that check itself.
--
-- Because it bypasses RLS, every guard is explicit and ordered here:
--   - a session must exist
--   - the invite must exist, be unrevoked, unaccepted and unexpired
--   - the signed-in account's email must match the address invited
--
-- The email match is what makes a forwarded link useless to a third party.
-- Without it the token would be a bearer credential redeemable by anyone who
-- ever saw it — including any team member who read token_hash before the
-- column grant above existed.
--
-- Single use is enforced by the conditional UPDATE, not by the earlier IF
-- checks: those can all pass in two concurrent transactions at once. Only one
-- can win the update of a row still matching "accepted_at is null", and only
-- the winner goes on to insert the membership.
create function public.accept_team_invite(p_token_hash text)
returns public.accept_invite_result
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite public.team_invites;
  v_team public.teams;
  v_claimed uuid;
begin
  if v_user_id is null then
    return ('not_authenticated', null, null)::public.accept_invite_result;
  end if;

  select email into v_user_email from auth.users where id = v_user_id;

  select * into v_invite from public.team_invites where token_hash = p_token_hash;

  if not found then
    return ('invalid', null, null)::public.accept_invite_result;
  end if;

  if v_invite.revoked_at is not null then
    return ('revoked', null, null)::public.accept_invite_result;
  end if;

  if v_invite.accepted_at is not null then
    return ('used', null, null)::public.accept_invite_result;
  end if;

  if v_invite.expires_at <= now() then
    return ('expired', null, null)::public.accept_invite_result;
  end if;

  -- team_invites.email is stored lowercase (check constraint above); the
  -- signed-in address is normalised here rather than trusted to match case.
  if lower(coalesce(v_user_email, '')) <> v_invite.email then
    return ('email_mismatch', null, null)::public.accept_invite_result;
  end if;

  select * into v_team from public.teams where id = v_invite.team_id;

  -- Already on the team: consume the invite so the link stops working, but
  -- report it honestly instead of silently doing nothing. Their existing role
  -- is deliberately left alone — an invite is not a role-change mechanism,
  -- that's the members screen's job.
  if exists (
    select 1 from public.team_members
    where team_id = v_invite.team_id and user_id = v_user_id
  ) then
    update public.team_invites
       set accepted_at = now(), accepted_by = v_user_id
     where id = v_invite.id and accepted_at is null;

    return ('already_member', v_team.slug, v_team.name)::public.accept_invite_result;
  end if;

  update public.team_invites
     set accepted_at = now(), accepted_by = v_user_id
   where id = v_invite.id
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
  returning id into v_claimed;

  if v_claimed is null then
    return ('used', null, null)::public.accept_invite_result;
  end if;

  -- on conflict: the unique (team_id, user_id) constraint from Phase 8 is the
  -- last word on duplicate memberships, covering the race the exists() check
  -- above can't (two invites for the same person redeemed simultaneously).
  insert into public.team_members (team_id, user_id, role, invited_by)
  values (v_invite.team_id, v_user_id, v_invite.role, v_invite.invited_by)
  on conflict (team_id, user_id) do nothing;

  return ('accepted', v_team.slug, v_team.name)::public.accept_invite_result;
end;
$$;
