This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

### Environment variables

Set these in Vercel under **Project Settings → Environment Variables** (apply to
Production, Preview, and Development). Values come from the Supabase dashboard:
**Project Settings → API Keys**.

| Variable | Used for | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Base URL of the Supabase project, used by every Supabase client (browser, server, admin) | Public — safe in the browser bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable/anon key (`sb_publishable_...`). Respects Row Level Security; used for all normal user-facing reads/writes | Public — safe in the browser bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | The secret key (`sb_secret_...`). Bypasses Row Level Security; used only by server-only code (e.g. `/api/health`'s database check, the Phase 12 seed script) | **Secret — server-only.** Never prefix with `NEXT_PUBLIC_`, never import into a Client Component or `lib/supabase/client.ts` |
| `INVITE_TOKEN_SECRET` | Keys the HMAC that turns a team invite token into the digest stored in `team_invites.token_hash`. The plaintext token is never stored, so this is what makes an invite link verifiable — and what keeps a database leak from yielding usable links | **Secret — server-only.** Rotating it invalidates every outstanding invite; existing memberships are unaffected |
| `MASTER_KEY` | Encrypts every per-secret data-encryption-key (envelope encryption, `lib/crypto/master-key.ts`). Validated at server startup — the app refuses to boot without a well-formed one | **Secret — server-only, never stored in the database.** Never commit it. If it's lost, every stored secret is permanently unrecoverable by design, not a bug |

Generate an invite secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Generate a master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Double-check the anon and secret keys are copied from the **same** Supabase
project as the URL — Supabase returns a generic `Invalid API key` error if a
key from a different project is pasted in.

### Steps

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In the [Vercel dashboard](https://vercel.com/new), import the repository.
   Framework preset auto-detects as Next.js — leave build/output settings default
   (`next build`, `.next`).
3. Under **Environment Variables**, add the variables from the table above.
4. Click **Deploy**. Vercel runs `npm run build`, which also runs `next lint`
   and the TypeScript check — the build fails if either has errors.
5. Once deployed, verify the database connection is live by visiting
   `https://<your-deployment>.vercel.app/api/health`. A healthy deploy returns
   HTTP 200 with `{"status":"ok", ...}`; if Supabase is unreachable or a key is
   wrong, it returns HTTP 503 with `{"status":"degraded", ...}` and an error
   message (never a secret value).
6. Every subsequent push to the connected branch redeploys automatically —
   Vercel Preview deployments run against the same Preview environment
   variables set in step 3.

### Local development

Copy `.env.example` to `.env.local` and fill in the same values. Never
commit `.env.local` — it's already covered by `.gitignore`.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more general details.
