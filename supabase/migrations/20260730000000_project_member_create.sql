-- Phase 17: project creation opens to members, not just admins.
--
-- Phase 11's own rule text ("Only admins can insert, update, or delete
-- teams, members, and projects") gated every project mutation to admins.
-- Phase 17's prompt explicitly widens exactly one verb: "Create a project
-- ... — admins and members only". Rename and delete aren't mentioned there,
-- so they stay on Phase 11's original admin-only policies untouched — this
-- migration only replaces the INSERT policy.
drop policy "Admins can create projects" on public.projects;

create policy "Admins and members can create projects"
  on public.projects for insert
  to authenticated
  with check (public.is_team_member(team_id, auth.uid(), 'member'));
