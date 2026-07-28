# SecureEnv — Complete Build Plan

All 44 phases in one file. Index and standing context first, then every phase in order.

---

44 phases. One sitting each. Work them in order.

**Before you start any phase**, make sure `CONTEXT.md` is in your project root as
`CLAUDE.md` (Claude Code) or `.cursorrules` (Cursor) — every phase prompt assumes it.

**How to work a phase:**
1. Open the phase file
2. Paste the prompt block into your coding agent
3. Read what it produced — don't accept blindly
4. Test the "Done when" condition
5. Commit with the phase number in the message
6. Move on

Don't run two phases at once. The point of small phases is knowing exactly which
step broke something.

## Index

| # | Phase | Stage |
|---|---|---|
| 1 | Scaffold the project | Foundation |
| 2 | Supabase connection | Foundation |
| 3 | Deploy to Vercel | Foundation |
| 4 | App shell layout | Foundation |
| 5 | Email authentication | Auth |
| 6 | Route protection | Auth |
| 7 | Profile on signup | Auth |
| 8 | Teams schema | Database |
| 9 | Projects and variables schema | Database |
| 10 | Audit and scan schema | Database |
| 11 | Row Level Security | Database |
| 12 | Seed script | Database |
| 13 | Create a team | Teams |
| 14 | Invite members | Teams |
| 15 | Members and roles UI | Teams |
| 16 | Team switcher | Teams |
| 17 | Projects CRUD | Projects |
| 18 | Auto-create environments | Projects |
| 19 | Environment tabs | Projects |
| 20 | Master key handling | Encryption |
| 21 | Encrypt | Encryption |
| 22 | Decrypt | Encryption |
| 23 | Crypto tests | Encryption |
| 24 | Add a variable | Variables |
| 25 | Variables list | Variables |
| 26 | Reveal a value | Variables |
| 27 | Edit and delete | Variables |
| 28 | Permission enforcement pass | Variables |
| 29 | Audit write helper | Audit |
| 30 | Audit log screen | Audit |
| 31 | Activity feed | Audit |
| 32 | Interaction polish | Polish |
| 33 | Search and filter | Polish |
| 34 | States and error handling | Polish |
| 35 | Responsive and dark mode | Polish |
| 36 | Accessibility pass | Polish |
| 37 | LLM client | AI |
| 38 | AI .env generator | AI |
| 39 | Rule-based scanner | AI |
| 40 | AI scanner layer | AI |
| 41 | Scanner UI | AI |
| 42 | README and diagrams | Ship |
| 43 | Demo mode | Ship |
| 44 | Landing page | Ship |

## Hard ordering rules

- **20–23 before 24–28.** Building CRUD on plaintext and adding encryption later means rewriting every query.
- **11 before 13.** Retrofitting row-level security is a rewrite, not a patch.
- **32–36 before 37.** An unpolished app with AI features looks worse than a polished one without them.
- **Never skip 23, or the payload assertion test in 40.** Those two are what make the security claims in your README true rather than aspirational.

## Safe to cut if time runs short

Phase 38 (AI .env generator). The Security Scanner alone carries the AI story.

## Never cut

Phases 20–23 (encryption), 29–31 (audit trail), 39–41 (scanner). These three things
are what separate this from a CRUD app.

---

## Standing context
Copy this into your project root as `CLAUDE.md` or `.cursorrules`.

---

Project: SecureEnv — a secrets manager for small dev teams.

Stack: Next.js 15 App Router, TypeScript (strict), Tailwind CSS,
Supabase (Postgres + Auth), Node's built-in `crypto` for AES-256-GCM.
Deployed on Vercel.

Data model: Team > Project > Environment (development/staging/production) > Variable

## Non-negotiable rules

1. Secret values are NEVER stored in plaintext. There is no plaintext value column.
2. Secret values are NEVER logged — not in errors, not in audit metadata, not in
   console output.
3. Secret values are NEVER sent to any third-party API, including the LLM.
4. The master key lives in an environment variable, never in the database.
5. Decryption happens one value at a time, on explicit request — never in bulk on
   page load.
6. Every mutation checks authorisation server-side. UI-level guards don't count.

## Code style

- TypeScript strict, no `any`
- Server actions or route handlers over client-side fetching where sensible
- Small focused files, clear names
- No unnecessary dependencies — check if Node or Next already does it
- Comment the *why* on anything security-related, not the *what*

---

# Phases


## Phase 1 — Scaffold the project

**Stage:** Foundation · **Depends on:** nothing
**Done when:** `npm run dev` shows a styled placeholder page.

## Prompt

```
Scaffold a new Next.js 15 project with the App Router, TypeScript in strict mode,
Tailwind CSS, and ESLint. Set up this folder structure:

  app/            routes
  components/     shared UI
  lib/            server utilities (db, crypto, auth helpers)
  types/          shared TypeScript types

Add a tailwind config with CSS custom properties for a design token system:
ink/paper/card/line/accent colours, plus dev/staging/production accent colours.
Create a placeholder home page confirming the setup works.
Do not add any UI library yet.
```

## Notes

Set up the design tokens now even though nothing uses them yet. Retrofitting a
token system after you've hardcoded colours across 40 components is miserable.

---


## Phase 2 — Supabase connection

**Stage:** Foundation · **Depends on:** Phase 1
**Done when:** a server component successfully queries Supabase and renders the result.

## Prompt

```
Set up Supabase in this Next.js project.

- Install @supabase/supabase-js and @supabase/ssr
- Create lib/supabase/server.ts and lib/supabase/client.ts with properly typed clients
  for server components, route handlers, and client components
- Read config from environment variables and fail loudly at startup if any are missing
- Add .env.example listing every variable this project needs, with placeholder values
- Add a temporary test page that queries Supabase and renders the result, so I can
  confirm the connection works

Never expose the service role key to the client.
```

## Notes

Delete the test page once it passes. The "fail loudly on missing env vars" part
matters — silent undefined config causes confusing bugs three phases later.

---


## Phase 3 — Deploy to Vercel

**Stage:** Foundation · **Depends on:** Phase 2
**Done when:** a live URL loads the app.

## Prompt

```
Prepare this project for Vercel deployment.

- Add a README section with exact deployment steps
- List every environment variable that must be set in Vercel, and what each is for
- Add a health-check route at app/api/health/route.ts returning status and a
  database connectivity check
- Make sure the build passes with no TypeScript or lint errors
```

## Notes

Deploying on day one is the single most important habit in this build. Projects
that leave deployment until the end usually never get deployed.

---


## Phase 4 — App shell layout

**Stage:** Foundation · **Depends on:** Phase 3
**Done when:** the shell renders with a working mobile drawer.

## Prompt

```
Build the application shell layout as a reusable component.

- Left sidebar: brand mark, workspace section, projects list, team section
  (members / audit log / settings), and a user block at the bottom
- Top bar: mobile menu button, breadcrumb, search input, spacer
- Main content area with a max width
- Below 900px the sidebar becomes an off-canvas drawer: opens via the menu button,
  closes on backdrop click and on Escape
- Use placeholder data for now
- Requirements: semantic HTML, aria-expanded on the menu button, visible focus rings,
  respect prefers-reduced-motion
```

## Notes

Use the HTML prototype as the visual reference. Getting the shell right now means
every later phase just drops content into a working frame.

---


## Phase 5 — Email authentication

**Stage:** Auth · **Depends on:** Phase 4
**Done when:** you can register, log out, and log back in.

## Prompt

```
Implement email and password authentication with Supabase Auth.

- Sign up, log in, and log out flows using server actions
- Route group (auth) for the login and signup pages, styled to match the app shell
- Inline validation and clear error messages — no alert() and no generic
  "something went wrong"
- Redirect to the dashboard after login, to login after logout
```

## Notes

Add GitHub OAuth too if it's quick — developers expect it in a devtool, and it's
one config block in Supabase.

---


## Phase 6 — Route protection

**Stage:** Auth · **Depends on:** Phase 5
**Done when:** a logged-out user hitting the dashboard lands on login and returns to their intended page after signing in.

## Prompt

```
Add route protection.

- Middleware that refreshes the Supabase session and protects all routes except
  the auth pages and the health check
- Redirect unauthenticated users to /login with a ?next= parameter, and send them
  to that destination after a successful login
- Add a getCurrentUser() server helper that returns the authenticated user or null
- Never trust client-side checks for authorisation
```

## Notes

Middleware handles routing convenience. It is not your security boundary — Phase 11
(RLS) and Phase 28 (permission pass) are.

---


## Phase 7 — Profile on signup

**Stage:** Auth · **Depends on:** Phase 6
**Done when:** a new signup automatically has a profiles row.

## Prompt

```
Create a profiles table and populate it automatically on signup.

- Table: id (references auth.users), display_name, avatar_initials, created_at
- A Postgres trigger that inserts a profile row when a new auth user is created
- Derive initials from the email if no display name is given
- A server helper to fetch the current user's profile
- Provide the SQL as a migration file in supabase/migrations/
```

## Notes

Doing this with a database trigger rather than application code means it can't be
skipped by a signup path you add later.

---


## Phase 8 — Teams schema

**Stage:** Database · **Depends on:** Phase 7
**Done when:** you can manually insert a team and a membership.

## Prompt

```
Create the teams schema as a SQL migration.

  teams          id, name, slug, created_by, created_at
  team_members   id, team_id, user_id, role, invited_by, created_at
                 role is an enum: admin | member | readonly
                 unique on (team_id, user_id)

Add indexes on the foreign keys. Include generated TypeScript types for these tables
in types/database.ts.
```

## Notes

The role enum is deliberately only three values. Resist adding more until you have
a real reason — permission systems grow complicated fast.

---


## Phase 9 — Projects and variables schema

**Stage:** Database · **Depends on:** Phase 8
**Done when:** the full hierarchy can be inserted manually.

## Prompt

```
Create the project hierarchy schema as a SQL migration.

  projects       id, team_id, name, description, created_by, created_at
  environments   id, project_id, name, sort_order, created_at
                 unique on (project_id, name)
  variables      id, environment_id, key, encrypted_value, encrypted_dek,
                 iv, auth_tag, description, created_by, updated_by, updated_at
                 unique on (environment_id, key)

Notes:
- encrypted_value, encrypted_dek, iv, and auth_tag are all text (base64)
- there is no plaintext value column anywhere, by design
- cascade deletes down the hierarchy
Update types/database.ts.
```

## Notes

The four separate crypto columns matter. AES-256-GCM needs the IV and the auth tag
to decrypt and verify — storing only the ciphertext makes the data unrecoverable.

---


## Phase 10 — Audit and scan schema

**Stage:** Database · **Depends on:** Phase 9
**Done when:** rows can be inserted into both tables.

## Prompt

```
Create two more tables as a SQL migration.

  audit_logs      id, team_id, user_id, action, target_type, target_id,
                  environment_id, metadata (jsonb), created_at
                  action is an enum: create | read | update | delete |
                  permission_change | invite
  security_scans  id, project_id, environment_id, score, issues (jsonb),
                  created_at

Index audit_logs on (team_id, created_at desc) for fast recent-activity queries.
audit_logs.metadata must never contain a secret value — note this in a SQL comment.
Update types/database.ts.
```

## Notes

`read` being an audited action is the interesting one. Most apps only log writes;
for a secrets manager, who *looked* at something is the more important question.

---


## Phase 11 — Row Level Security

**Stage:** Database · **Depends on:** Phase 10
**Done when:** a user from team A gets zero rows when querying team B's data.

## Prompt

```
Enable Row Level Security on every application table and write the policies.

Rules:
- A user can only see rows belonging to a team they are a member of
- Only admins can insert, update, or delete teams, members, and projects
- Members can read and write variables; readonly members can only read
- audit_logs are insert-and-read only, never updatable or deletable by anyone
- Write a reusable SQL helper function is_team_member(team_id, user_id, min_role)

Then write a test script that creates two teams with different users and proves
cross-team reads return nothing.
```

## Notes

**Do not skip the test script.** RLS that looks right but isn't enforced is worse
than no RLS, because you'll build on top of a false assumption. This is the phase
that makes multi-tenancy real.

---


## Phase 12 — Seed script

**Stage:** Database · **Depends on:** Phase 11, Phase 21
**Done when:** one command produces a fully populated demo team.

## Prompt

```
Write a seed script (scripts/seed.ts) that creates realistic demo data.

- One team, "Northstar Agency", with three members across the three roles
- Three projects, each with development / staging / production environments
- Around 7 variables per environment using realistic key names
  (DATABASE_URL, STRIPE_SECRET_KEY, NEXTAUTH_SECRET, RESEND_API_KEY, and so on)
- All values are obviously fake placeholders
- Deliberately plant a few problems for the scanner to find later: a live-looking
  Stripe key in development, a too-short secret, and a duplicated value
- Values must be written through the real encryption path, not inserted raw
- Make the script idempotent — safe to run twice
```

## Notes

This phase needs the encryption module, so run it after Phase 21 even though it
sits in the database stage. The planted problems are what you'll demo in Phase 41.

---


## Phase 13 — Create a team

**Stage:** Teams · **Depends on:** Phase 11
**Done when:** a new user is walked into creating their first team.

## Prompt

```
Implement team creation.

- A create-team form (name, auto-generated slug) using a server action
- The creator is inserted as an admin in team_members in the same transaction
- If a user has no teams, redirect them to an onboarding page that explains what a
  team is in one sentence and shows the create form
- After creation, redirect to that team's dashboard
```

## Notes

Same transaction matters — a team with no admin is an orphaned row nobody can
manage or delete.

---


## Phase 14 — Invite members

**Stage:** Teams · **Depends on:** Phase 13
**Done when:** an invite link lets a second account join the team.

## Prompt

```
Implement team member invitations.

- An invite form: email plus role selector (admin / member / readonly)
- Generate a signed invite token with an expiry, stored in a team_invites table
- An accept-invite page that adds the user to the team, creating their account
  first if they are not signed up yet
- Prevent duplicate memberships and expired token reuse
- Show pending invites in the members list with a revoke option
```

## Notes

Test the "invited person doesn't have an account yet" path specifically. It's the
one that breaks, and it's the common case for a new team.

---


## Phase 15 — Members and roles UI

**Stage:** Teams · **Depends on:** Phase 14
**Done when:** an admin can change a role and a non-admin cannot see the controls.

## Prompt

```
Build the team members screen.

- Table of members: avatar, name, email, role, joined date
- Admins can change a member's role and remove members
- Non-admins see the list read-only, with no action controls rendered at all
- Prevent removing or demoting the last remaining admin, with a clear explanation
- Enforce every one of these rules server-side, not only in the UI
```

## Notes

"Not rendered at all" beats "rendered but disabled" here. Disabled controls tell a
readonly user what they're missing; absent controls just look like a clean screen.

---


## Phase 16 — Team switcher

**Stage:** Teams · **Depends on:** Phase 15
**Done when:** switching teams changes the whole sidebar context.

## Prompt

```
Add a team switcher to the sidebar.

- Dropdown listing every team the user belongs to, with the current one marked
- Selecting a team navigates to that team's dashboard
- Persist the last-used team so the next login lands in the right place
- Include a "Create team" action at the bottom of the dropdown
```

## Notes

Freelancers and agencies are a target user, and they'll have one team per client.
Make sure the switcher stays usable at 10+ teams, not just 2.

---


## Phase 17 — Projects CRUD

**Stage:** Projects · **Depends on:** Phase 16
**Done when:** you can create, rename, and delete a project.

## Prompt

```
Implement project management.

- Create a project (name, optional description) — admins and members only
- Projects list in the sidebar with a per-project variable count
- Rename and delete a project; deletion requires typing the project name to confirm,
  and warns how many variables will be destroyed
- Project settings page
```

## Notes

The type-the-name-to-confirm pattern is worth the extra work. Deleting a project
here destroys secrets that may exist nowhere else.

---


## Phase 18 — Auto-create environments

**Stage:** Projects · **Depends on:** Phase 17
**Done when:** a brand-new project already has three environments.

## Prompt

```
Auto-create environments when a project is created.

- Every new project gets development, staging, and production, in that sort order
- Allow adding a custom environment later, and renaming or deleting non-default ones
- Prevent deleting an environment that still contains variables without an explicit
  confirmation step
```

## Notes

Defaulting to three environments teaches the mental model without a tutorial. A
user who has to create them manually often just makes one and misses the point.

---


## Phase 19 — Environment tabs

**Stage:** Projects · **Depends on:** Phase 18
**Done when:** switching tabs changes the accent colour of the whole page.

## Prompt

```
Build the environment switcher UI.

- Horizontal tab strip: variable count, environment name, and a one-line purpose
  ("local machines", "pre-release testing", "live customers")
- Each environment has its own accent colour: development teal, staging amber,
  production crimson
- The selected environment sets a CSS variable that tints a thin band at the top of
  the viewport and a status dot on the brand mark
- Horizontally scrollable on mobile, with proper tablist / tab / aria-selected roles
- Reflect the selected environment in the URL so it can be linked and refreshed
```

## Notes

The colour band isn't decoration. Your product's core safety promise is that dev and
production never get confused — the interface should make it impossible to forget
which one you're editing.

---


## Phase 20 — Master key handling

**Stage:** Encryption · **Depends on:** Phase 3
**Done when:** the app refuses to boot with a missing or malformed master key.

## Prompt

```
Create lib/crypto/master-key.ts.

- Load MASTER_KEY from the environment as a 32-byte key in hex
- Validate it at module load: correct length, valid hex — throw a clear, actionable
  error if not
- Export a helper that generates a new key, plus a documented CLI command
  (node -e "...") for generating one
- Never log the key or include it in an error message
- Add a comment explaining why the master key must live outside the database
```

## Notes

Generate your key now and put it in Vercel:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit it. If you lose it, every stored secret is permanently unrecoverable —
that's the design working correctly, not a bug.

---


## Phase 21 — Encrypt

**Stage:** Encryption · **Depends on:** Phase 20
**Done when:** encrypting the same value twice produces different ciphertext.

## Prompt

```
Implement the encryption half of envelope encryption in lib/crypto/envelope.ts.

encryptSecret(plaintext: string) returns:
  { encryptedValue, encryptedDek, iv, authTag }  — all base64 strings

Steps:
1. Generate a random 32-byte DEK
2. Generate a random 12-byte IV
3. Encrypt the plaintext with AES-256-GCM using the DEK, capturing the auth tag
4. Encrypt the DEK with the master key using AES-256-GCM (its own IV and tag)
5. Return everything base64-encoded

Use only Node's built-in crypto module. Add JSDoc explaining each step.
```

## Notes

**Read this generated code line by line.** This is the part interviewers will ask
about, and "the AI wrote it" is not an answer you want to give. Make sure you can
explain why the IV is random per encryption and why the auth tag is stored.

---


## Phase 22 — Decrypt

**Stage:** Encryption · **Depends on:** Phase 21
**Done when:** a round trip returns the original string exactly.

## Prompt

```
Implement the decryption half in lib/crypto/envelope.ts.

decryptSecret({ encryptedValue, encryptedDek, iv, authTag }) returns the plaintext.

Steps:
1. Decrypt the DEK with the master key
2. Use the DEK to decrypt the value, verifying the GCM auth tag
3. Throw a specific DecryptionError if authentication fails — never return partial
   or garbage output

The plaintext must never be logged, cached, or written to disk anywhere in this
module.
```

## Notes

Failing loudly on a bad auth tag is the whole point of GCM over plain AES. If
someone tampers with a row in the database, decryption should throw, not return
corrupted output that gets used as a password.

---


## Phase 23 — Crypto tests

**Stage:** Encryption · **Depends on:** Phase 22
**Done when:** all tests pass.

## Prompt

```
Write unit tests for the envelope encryption module using Vitest.

Cover:
- round trip: encrypt then decrypt returns the original value
- unicode and very long values survive the round trip
- the same plaintext encrypted twice produces different ciphertext
- tampering with encryptedValue causes decryption to throw
- tampering with authTag causes decryption to throw
- a wrong master key causes decryption to throw
- an empty string is handled correctly

Set up the Vitest config and add a test script to package.json.
```

## Notes

**Never skip this phase.** These tests are what let you write "AES-256-GCM envelope
encryption" in your README as a fact rather than a claim. They're also the thing to
show when someone asks how you know it works.

---


## Phase 24 — Add a variable

**Stage:** Variables · **Depends on:** Phase 23, Phase 19
**Done when:** the Supabase table editor shows unreadable ciphertext.

## Prompt

```
Implement adding a variable.

- Form: key (uppercase, underscores, validated), value, optional description
- A server action that encrypts the value before any database write
- Reject duplicate keys within the same environment, with a clear message
- Enforce role: readonly members cannot create
- The plaintext value must never appear in a log, an error, or a server response
```

## Notes

Go and look at the row in the Supabase table editor after saving. Seeing your own
secret as unreadable base64 is the moment this project becomes real.

---


## Phase 25 — Variables list

**Stage:** Variables · **Depends on:** Phase 24
**Done when:** the list renders with every value masked.

## Prompt

```
Build the variables list for an environment.

- Rows: key in monospace, description, a masked value, last-updated stamp, actions
- Values render as solid redaction bars — no decryption happens on page load
- Variables whose key starts with NEXT_PUBLIC_ display in plain text with a
  "public" tag, since they are not secret
- Empty state with a clear next action
- Responsive: on mobile each row becomes a stacked card
```

## Notes

No decryption on page load is a real constraint, not a UI preference. Loading a
page should never decrypt 20 secrets the user didn't ask to see.

---


## Phase 26 — Reveal a value

**Stage:** Variables · **Depends on:** Phase 25
**Done when:** revealing decrypts one value and re-masks it automatically.

## Prompt

```
Implement single-value reveal.

- A route handler that decrypts exactly one variable by id
- Verify the user's team membership and role before decrypting
- Return the plaintext with no-store cache headers
- Client: clicking a redaction bar reveals the value, shows a "revealed · logged"
  trace, runs a 15-second countdown bar, then re-masks automatically
- Never bulk-decrypt an environment in one request
```

## Notes

This is the signature interaction of the whole product. Revealing a secret should
feel deliberate and visibly logged — that's the feature, not decoration.

---


## Phase 27 — Edit and delete

**Stage:** Variables · **Depends on:** Phase 26
**Done when:** editing re-encrypts with a fresh DEK.

## Prompt

```
Implement editing and deleting variables.

- Edit: change the key, value, or description. If the value changes, generate a new
  DEK and re-encrypt — never reuse the old DEK
- The edit form must not pre-fill the existing secret value; require re-entry, and
  leave the value unchanged if the field is left blank
- Delete with a confirmation step
- Enforce roles server-side on both operations
```

## Notes

The no-pre-fill rule is the detail most people miss. Pre-filling means decrypting on
page load, which breaks the rule you set in Phase 25.

---


## Phase 28 — Permission enforcement pass

**Stage:** Variables · **Depends on:** Phase 27
**Done when:** every mutation has been checked, not just the ones with UI guards.

## Prompt

```
Audit every server action and route handler in this project for authorisation.

For each one, verify in this order: authenticated, is a member of the team that owns
the resource, and holds a sufficient role for the operation.

- Extract a reusable requireTeamAccess(resourceId, minRole) helper
- Apply it consistently everywhere
- Produce a table listing every mutation endpoint, the role it requires, and whether
  it was already enforced before this pass
```

## Notes

That output table is worth keeping. It's a genuinely good artifact to show in an
interview — it demonstrates you audit your own work rather than assuming.

---


## Phase 29 — Audit write helper

**Stage:** Audit · **Depends on:** Phase 28
**Done when:** every mutation writes exactly one audit row.

## Prompt

```
Create lib/audit.ts with a logAudit() helper.

- Records team, user, action, target type and id, environment, and metadata
- Call it from every mutation: create, read/reveal, update, delete,
  permission change, invite
- metadata may contain key names but never secret values — enforce this with a
  runtime guard that strips anything resembling a value field
- Audit failures must never block the primary operation; log them separately
```

## Notes

The runtime guard matters more than it sounds. Audit metadata is exactly the kind
of place a secret leaks into by accident six months later.

---


## Phase 30 — Audit log screen

**Stage:** Audit · **Depends on:** Phase 29
**Done when:** you can filter the log by user and action.

## Prompt

```
Build the audit log page.

- Reverse-chronological table: timestamp, actor, action, target, environment
- Filters: user, action type, environment, date range
- Cursor-based pagination
- Colour-code actions by type
- Export to CSV
- Empty and loading states
```

## Notes

CSV export sounds like a throwaway feature but it's the one that makes this look
enterprise-ready to a client. Compliance people ask for exports.

---


## Phase 31 — Activity feed

**Stage:** Audit · **Depends on:** Phase 30
**Done when:** revealing a secret makes it appear at the top of the feed.

## Prompt

```
Build a recent-activity panel for the project dashboard.

- Vertical timeline of the last 5 to 8 events with connecting line markers
- Read events use the current environment's accent colour, writes use the app accent
- Relative timestamps ("2 minutes ago")
- A link to the full audit log
- Sits in a right-hand column on wide screens and stacks below on narrow ones
```

## Notes

This is what brings the audit trail out of a settings page and onto the main screen.
It's a small panel that changes how trustworthy the whole product feels.

---


## Phase 32 — Interaction polish

**Stage:** Polish · **Depends on:** Phase 31
**Done when:** the reveal-and-copy flow feels finished.

## Prompt

```
Polish the core interactions.

- Copy to clipboard on variables, with an inline "Copied" state and a toast
- Copying is an audited read, same as revealing
- Hover affordance on redaction bars
- Toast system for confirmations, respecting prefers-reduced-motion
- Staggered entry animation on list rows, also motion-safe
```

## Notes

Copy being audited is the correct call — copying a secret to the clipboard is
exactly as sensitive as looking at it, arguably more so.

---


## Phase 33 — Search and filter

**Stage:** Polish · **Depends on:** Phase 32
**Done when:** filtering is instant and has a real empty state.

## Prompt

```
Add search and filtering.

- Filter variables by key within the current environment, debounced
- Global search across projects and variable keys — never across values
- Keyboard shortcut to focus search
- A distinct empty state for "no matches" versus "nothing here yet"
```

## Notes

Never search across values. It would require decrypting everything on every
keystroke, which defeats the entire architecture.

---


## Phase 34 — States and error handling

**Stage:** Polish · **Depends on:** Phase 33
**Done when:** no screen can show a raw error or an infinite spinner.

## Prompt

```
Add proper loading, error, and empty states throughout.

- loading.tsx skeletons for every route segment
- error.tsx boundaries with a retry action
- Empty states that explain what to do next, not just "no data"
- Errors state what went wrong and how to fix it, in the interface's voice
- Never surface a raw exception, and never leak internal details to the client
```

## Notes

Leaked stack traces are an actual security issue in a secrets product, not just an
ugly screen. Check that decryption errors in particular return something generic.

---


## Phase 35 — Responsive and dark mode

**Stage:** Polish · **Depends on:** Phase 34
**Done when:** the full flow works one-handed on a phone.

## Prompt

```
Complete responsive behaviour and dark mode.

- Verify every screen at 360px, 768px, 1024px, and 1440px
- Tables collapse to cards on mobile; action buttons become full width
- Dark mode via CSS custom properties, following the system preference with a
  manual toggle that persists
- Check contrast in both modes, especially the environment accent colours
```

## Notes

Test on a real phone, not just a resized browser window. Touch targets and the
drawer gesture behave differently.

---


## Phase 36 — Accessibility pass

**Stage:** Polish · **Depends on:** Phase 35
**Done when:** the whole app is usable with only a keyboard.

## Prompt

```
Do an accessibility pass over the entire application.

- Every interactive element reachable by keyboard with a visible focus ring
- Correct roles and aria attributes on tabs, dialogs, and menus
- Dialogs trap focus and close on Escape
- Form inputs have associated labels; errors are announced via aria-live
- All images and icon-only buttons have accessible names
- prefers-reduced-motion respected everywhere
Report anything you could not fix rather than silently skipping it.
```

## Notes

Unplug your mouse and try to add a variable. That's the test.

---


## Phase 37 — LLM client

**Stage:** AI · **Depends on:** Phase 36
**Done when:** a test call returns valid parsed JSON.

## Prompt

```
Set up the LLM client in lib/ai/client.ts.

- Use Groq (or Gemini) via its REST API, server-side only
- A typed helper that takes a prompt and a JSON schema shape and returns parsed,
  validated JSON — use Zod for validation
- Handle: malformed JSON, refusals, timeouts, and rate limits, each with a distinct
  error type
- Per-user rate limiting on AI endpoints
- A hard rule enforced in this module: no decrypted secret value may ever be
  included in a prompt
```

## Notes

You need one real API key here — Groq or Gemini free tier is enough. This is the
only third-party credential the project actually requires.

---


## Phase 38 — AI .env generator

**Stage:** AI · **Depends on:** Phase 37
**Done when:** picking three services returns a correct key list.

## Prompt

```
Build the AI .env generator.

- UI: a multi-select of common services (Next.js, Stripe, Supabase, Resend,
  Cloudinary, Postgres, Auth.js, Cloudflare R2, Twilio) plus a free-text field
- Server action prompts the LLM for the standard environment variable names each
  service requires, with a one-line description and whether it is public or secret
- Response validated against a Zod schema
- Render results as a checklist; the user picks which to add, fills in values, and
  saves through the normal encryption path
- Values are entered by the user only — the LLM never generates a secret value
- Handle failure with a retry option, never a dead spinner
```

## Notes

**This is the cuttable phase.** If time runs short, skip it — the Security Scanner
alone carries the AI story. Come back to it after Phase 44 if you have room.

---


## Phase 39 — Rule-based scanner

**Stage:** AI · **Depends on:** Phase 37
**Done when:** the seeded bad environment produces the expected findings.

## Prompt

```
Build the rule-based half of the security scanner in lib/scanner/rules.ts.

Each rule takes the variables of one environment and returns findings with a
severity, message, and suggested fix.

Rules:
- value shorter than 16 characters for keys matching /SECRET|KEY|TOKEN|PASSWORD/
- the same value used by two or more variables
- a value matching /^sk_live_/ in a non-production environment
- a value matching /^sk_test_/ in production
- a key prefixed NEXT_PUBLIC_ whose name also matches /SECRET|KEY|TOKEN|PASSWORD/
- a variable not updated in more than 180 days
- a key that exists in one environment but is missing from another in the same project

Rules operate on decrypted values in memory only — nothing is persisted or logged.
Unit test each rule.
```

## Notes

Note that the most valuable checks here aren't AI at all — they're regex and
comparisons. Being able to say "I used AI only where it added something rules
couldn't" is a stronger interview answer than "I used AI for everything".

---


## Phase 40 — AI scanner layer

**Stage:** AI · **Depends on:** Phase 39
**Done when:** the LLM adds findings the rules missed, with no values in the payload.

## Prompt

```
Add the LLM layer of the security scanner in lib/scanner/ai.ts.

- Build a payload containing ONLY: key names, value character length, a coarse
  character-class summary (has digits / has symbols / looks base64 / looks like a
  URL), environment name, and last-updated age
- Assert in code that no decrypted value can enter this payload, and unit test that
  assertion
- Prompt the LLM to identify additional risky patterns and naming problems, and to
  explain each in plain language with a concrete fix
- Validate the response with Zod, merge with the rule-based findings, deduplicate
- Compute a 0–100 score weighted by severity
- Persist the result to security_scans

Add a comment explaining why values are excluded: sending stored secrets to a
third-party API would reproduce the exact vulnerability this product prevents.
```

## Notes

**The payload assertion test is the most important test in this project after the
crypto tests.** It's the proof behind your central design claim. Make sure it fails
if someone later adds a value field to the payload.

---


## Phase 41 — Scanner UI

**Stage:** AI · **Depends on:** Phase 40
**Done when:** a bad environment scores low and each issue explains its fix.

## Prompt

```
Build the security scanner UI.

- A posture panel: large score, a 10-segment meter tinted with the environment
  accent colour, and the prioritised findings list
- Findings grouped by severity with a "Fix" action that deep-links to the offending
  variable
- A "Run scan" action with a progress state, and a last-scanned timestamp
- Per-environment scores; production with no variables shows a neutral placeholder
  rather than a zero
- Score history sparkline if more than one scan exists
```

## Notes

This is your demo screen. When you record the portfolio video, this is the shot —
a low score, real findings, each one explaining itself.

---


## Phase 42 — README and diagrams

**Stage:** Ship · **Depends on:** Phase 41
**Done when:** a stranger understands the project in two minutes.

## Prompt

```
Write the project README.

Product name: SecureEnv
Tagline: "SecureEnv — the redaction ledger for team secrets"
Use the tagline directly under the title, above the problem statement.

Sections: the problem in two sentences, screenshots, features, architecture
overview, the encryption design explained with a diagram (Mermaid), the data model,
local setup, environment variables, deployment, and a testing section.

Add a clearly-labelled Roadmap section for everything deliberately deferred: CLI
tool, KMS-backed per-tenant keys, key rotation, secret version history, subscription
tiers, and the remaining AI features.

Write for a technical reader who has never seen the project. Explain design
decisions, not just features.
```

## Notes

The roadmap section is doing real work. It lets you show you understand key
rotation and KMS without having to build them — and framing them as deliberate
deferrals reads as judgement, not as gaps.

---


## Phase 43 — Demo mode

**Stage:** Ship · **Depends on:** Phase 42
**Done when:** a visitor can explore without signing up.

## Prompt

```
Add a demo mode.

- A seeded read-only demo account with a one-click login on the landing page
- Realistic fake data across three projects, including planted scanner findings
- Demo users cannot mutate anything; attempts show a friendly explanation
- A dismissible banner making clear this is demo data
- Reset the demo data on a schedule or on demand
```

## Notes

Most recruiters won't create an account. A one-click demo is the difference between
your project being looked at and being skipped.

---


## Phase 44 — Landing page

**Stage:** Ship · **Depends on:** Phase 43
**Done when:** the URL is something you would put on a CV.

## Prompt

```
Build a landing page for SecureEnv.

- Hero headline: "SecureEnv" with the tagline "the redaction ledger for team
  secrets" directly beneath it
- Hero explaining the problem in one sentence, with the redaction-reveal interaction
  as a live demo rather than a static screenshot
- Three sections: encrypted storage, team access control, AI security scanning —
  each with a real product screenshot
- A short "how the encryption works" section with the envelope diagram
- Links to the demo, the GitHub repo, and my portfolio
- Fully responsive, dark mode, fast — no heavy animation libraries
```

## Notes

Putting the live reveal interaction in the hero is worth the effort. It explains
the product in three seconds without a single line of copy being read.

---

## After Phase 44

You now have a complete, deployed, documented project. Things worth doing next,
in rough order of value:

1. Write the portfolio case study — the design decisions, not the feature list
2. Record a 90-second demo video
3. Go back and build Phase 38 if you skipped it
4. Start the CLI tool — it's the feature that makes this feel like a real
   secrets manager, and it's a good standalone piece of work

---
