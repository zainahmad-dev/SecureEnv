# Permission enforcement audit

Phase 28 of the build plan. Every server action and route handler in this
project, checked for the same three things in the same order: **is the
caller authenticated, are they a member of the team that owns the resource,
and do they hold a sufficient role for the operation.**

The real enforcement for every one of these is Postgres Row Level Security
(see the `20260729160000_row_level_security.sql` migration) — RLS is what
actually rejects an unauthorized write no matter what path reaches it. What
this audit is about is the *preflight*: whether each entry point checks
authorization explicitly enough to give the caller an honest, specific
answer, rather than a generic error or — worse — a silent no-op that reads
as success.

## What changed

**`lib/auth/team-access.ts`** — a single `requireTeamAccess(teamId, minRole,
deniedMessage)` helper, used everywhere below marked "yes" in the
*enforced after* column. It replaces five independently duplicated
`getCallerRole()` functions (one per action file, each hand-rolling the same
`team_members` query and the same role comparison) with one implementation,
and it's what caught the two real gaps this pass found.

Two genuine gaps were found and fixed:

- **`createTeam`** had no explicit `getCurrentUser()` check at all. RLS still
  rejected an unauthenticated attempt (the underlying `create_team()` RPC
  requires the `authenticated` role), but the failure surfaced as a generic
  "Could not create the team" message instead of a redirect to `/login`,
  because nothing in the action code ever looked.
- **`revokeInvite`** had *no* explicit authorization check whatsoever — not
  authentication, not team membership, not role. It relied entirely on
  RLS's UPDATE policy. That's not a security hole (RLS still denies a
  non-admin's write), but Postgres RLS denies an UPDATE by matching zero
  rows, not by raising an error — Phase 15 already documented this same trap
  once — so a denied revoke returned `error: null`, which the UI reads as
  success. A non-admin somehow reaching this action (dev tools, a crafted
  request) would have been told the invite was revoked when nothing had
  actually happened.

Everything else below was already correctly enforced before this pass; it
was consolidated onto `requireTeamAccess` for consistency, not because it
was broken.

## Audit table

| Entry point | Resource | Min role | Enforced before Phase 28 | Enforced after |
|---|---|---|---|---|
| `logIn` / `signUp` / `logOut` / `signInWithGitHub` (`lib/auth/actions.ts`) | none — account-level, pre-team | n/a | n/a | n/a |
| `createTeam` (`lib/teams/actions.ts`) | none — creates the team itself | authenticated only | **No** — auth check missing, silently relied on RLS | **Yes** — explicit `getCurrentUser()` added |
| `updateMemberRole` (`lib/teams/member-actions.ts`) | team | admin | Yes (inline check) | Yes (`requireTeamAccess`) |
| `removeMember` (`lib/teams/member-actions.ts`) | team | admin | Yes (inline check) | Yes (`requireTeamAccess`) |
| `inviteMember` (`lib/invites/actions.ts`) | team | admin | Yes (inline check) | Yes (`requireTeamAccess`) |
| `revokeInvite` (`lib/invites/actions.ts`) | team invite | admin | **No** — zero explicit checks, RLS-only | **Yes** — explicit `requireTeamAccess`, `teamId` threaded through the form |
| `acceptInvite` (`lib/invites/actions.ts`) | team invite | n/a — deliberately not team-gated; this is how membership is *gained* | Yes (auth-only check, correctly ordered) | Unchanged — exempt by design |
| `createProject` (`lib/projects/actions.ts`) | team | member | Yes (inline check) | Yes (`requireTeamAccess`) |
| `renameProject` (`lib/projects/actions.ts`) | project | admin | Yes (inline check) | Yes (`requireTeamAccess`) |
| `deleteProject` (`lib/projects/actions.ts`) | project | admin | Yes (inline check) | Yes (`requireTeamAccess`) |
| `addEnvironment` (`lib/environments/actions.ts`) | project | member | Yes (inline check) | Yes (`requireTeamAccess`) |
| `renameEnvironment` (`lib/environments/actions.ts`) | environment | admin | Yes (`loadTarget` preflight) | Yes (`requireTeamAccess` inside `loadTarget`) |
| `deleteEnvironment` (`lib/environments/actions.ts`) | environment | admin | Yes (`loadTarget` preflight) | Yes (`requireTeamAccess` inside `loadTarget`) |
| `createVariable` (`lib/variables/actions.ts`) | environment | member | Yes (inline check) | Yes (`requireTeamAccess`) |
| `updateVariable` (`lib/variables/actions.ts`) | variable | member | Yes (inline check) | Yes (`requireTeamAccess`) |
| `deleteVariable` (`lib/variables/actions.ts`) | variable | member | Yes (inline check) | Yes (`requireTeamAccess`) |
| `GET /api/health` | none — deploy/monitoring probe | n/a — intentionally public | n/a | n/a |
| `GET /auth/callback` | none — OAuth code exchange | n/a — pre-authentication by nature | n/a | n/a |
| `POST /api/variables/[id]/reveal` | variable | member or readonly (any team member) | Yes — but via a different mechanism (see below) | Unchanged — deliberately not on `requireTeamAccess` |

**22 entry points audited. 2 real gaps found and fixed. 1 intentional
exemption (`acceptInvite`). 1 route that uses a stronger, resource-derived
pattern instead of this helper (below). 1 self-scoped write
(`setLastTeam`, `lib/teams/queries.ts`) that isn't a team-authorization
concern at all — it only ever writes the caller's own `profiles` row,
protected by the self-only column-grant RLS policy from Phase 7/16, not a
team boundary.**

## Addendum — Phase 43: the demo account

`requireTeamAccess` gained one more check, ahead of the role lookup: if the
session is the shared public demo account, it denies with an explanation of
the demo instead of a permission error.

Consolidating onto this one helper in Phase 28 is what made that a
single-branch change rather than an edit to every file in the table above —
and it means any entry point added *after* Phase 43 inherits the behaviour
without anyone remembering to add it. The one action that can't inherit it
is `createTeam`, for the same reason it needed a bespoke check in Phase 28:
there is no existing team to pass in. It repeats the check inline.

As everywhere else on this page, this is preflight only. The actual
enforcement is a set of **restrictive** RLS policies added in the same
migration, which subtract INSERT/UPDATE/DELETE from that account across
every table regardless of which code path reaches the database.
`npm run test:demo` verifies them by bypassing every entry point in the
table above and writing straight to PostgREST.

## Why `POST /api/variables/[id]/reveal` doesn't use `requireTeamAccess`

Every action above receives its resource's `teamId` directly — as a form
field, from the page that rendered it. The reveal route is the one place
that isn't true: it only gets a variable id in the URL, no team id from the
client at all. It reads the variable through the same RLS-bound client
every other query in this app uses, and Phase 11's own SELECT policy on
`variables` ("member or readonly") *is* the access check — the row simply
doesn't come back for anyone who shouldn't see it.

Retrofitting this route onto `requireTeamAccess(teamId, minRole)` would mean
trusting a client-supplied team id to decide access to a row instead of
letting the row's own real team decide it. That's a downgrade dressed up as
consistency. The two patterns exist for different reasons: `requireTeamAccess`
turns a client-supplied hint into a proper preflight so failures are
readable; the reveal route never had a hint to turn into anything, and
resolving access from the resource itself is strictly stronger.
