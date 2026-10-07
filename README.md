# Solo Queue

Personal publishing engine — research once, stay weeks ahead on Threads and
Instagram with zero per-post fees. Single operator, no auth, no billing.

Design system: `../docs/design.md` (Espresso Collage tokens) +
`../docs/design.html` (live renders). Strategy and specs: `../docs/`.

## Getting Started

First, copy the env template and fill in values (see Environment below):

```bash
cp .env.example .env.local
```

Then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

In a second terminal, run the Convex local backend (watch mode; safe to stop
with Ctrl+C at any time — schema and data live on disk):

```bash
npx convex dev
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
for Bricolage Grotesque, DM Sans, and DM Mono per the design tokens.

## Environment

| Variable | Purpose | Where |
|---|---|---|
| `CONVEX_DEPLOYMENT` | Convex deployment name (written by `npx convex dev`) | Local only |
| `NEXT_PUBLIC_CONVEX_URL` | Convex client URL for the browser | Vercel: **prod** URL from Convex dashboard |
| `APP_BASE_URL` | Base URL of this app (OAuth callbacks, cron health) | Vercel: `https://<app>.vercel.app` |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` / `THREADS_REDIRECT_URI` | Threads API OAuth — from Use Cases → Threads → Customize Settings, NOT the general app credentials | **Both** Vercel and Convex prod (`npx convex env set … --prod`) |
| `IG_APP_ID` / `IG_APP_SECRET` / `IG_REDIRECT_URI` | Instagram Platform API OAuth (Instagram Login path) | **Both** Vercel and Convex prod |
| `LLM_API_KEY` / `LLM_MODEL` | Draft generation provider key + model (swappable); read by `convex/drafting.ts` | **Convex only** (local backend and prod), not Vercel |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | Dashboard login (REQUIRED in production; omit only for local dev) | Vercel only |
| `OAUTH_STATE_SECRET` | Signs OAuth state cookies (REQUIRED for Connect flows; any 32-byte hex) | Vercel only |
| `PUBLISH_DRY_RUN` | Publisher mode. Posts for real **only when exactly `0`**; unset or anything else is dry-run | Convex only (set `1` on local and prod until the publisher is verified) |
| `CONVEX_DEPLOY_KEY` | Production deploy key used by `npx convex deploy` in the Vercel build command (TASK-087). Production environment only | Vercel build only |
| `OPERATOR_JWT_PRIVATE_KEY` | Private half of the operator signing key (base64 PEM). Signs the 1-hour token the browser uses to call Convex (`/api/convex-token`) | Vercel **Production only** (and `.env.local` for local dev) |
| `OPERATOR_JWKS` | Public half (a `data:` URI key set). Lets Convex verify operator tokens; the deploy fails without it | **Convex only** (local backend and prod) |
| `ALLOW_TEST_PUBLISH` | Enables the Connections test publish/delete (posts to the real Threads account). Off unless exactly `1` | Convex only; leave unset on prod |

Backend actions run on Convex Cloud and read **Convex** env vars — Vercel
vars never reach them. If a Meta flow fails with a bare server error, check
both sides. List names only, never values: `npx convex env list --prod | % { ($_ -split '=',2)[0] }` (PowerShell).

## Deploy

Vercel (Hobby) for the Next.js app, Convex Cloud for the backend:

```bash
npx convex login      # link a hosted Convex project (one-time, opens browser)
npx convex deploy     # push functions + schema to the hosted project
```

Then create the Vercel project from this directory, add every variable from
`.env.example` (with production values) to the Vercel project environment —
including `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`, which are REQUIRED in
production. Then in the Vercel dashboard go to the project → Settings →
Deployment Protection and enable **Vercel Authentication** (Standard
Protection). Why both: on the Hobby plan, Vercel Authentication covers preview
and deployment URLs but NOT the production domain — the in-app Basic Auth gate
(`src/proxy.ts`) covers everything, and refuses to serve production at all if
its vars are missing.

## Operator auth (TASK-089)

Every public Convex function (except the landing page waitlist) refuses callers
who are not the operator, so knowing the Convex URL is not enough to read drafts,
spend LLM credits or queue posts. How it works: the Basic Auth login gates
`/api/convex-token`, which signs a 1-hour RS256 token; the browser sends it to
Convex, which verifies it with the public key (`convex/auth.config.ts`). The
browser refreshes the token itself; if it ever cannot, the app shows "Session
ended" and a reload brings the login prompt back.

- **Local dev (once):** `node scripts/operator-keys.mjs --local` writes a
  throwaway key pair into `.env.local` and the local Convex env (prints nothing).
  Restart `next dev`, then `npx convex dev --once`.
- **Production (once, by the founder):** `node scripts/operator-keys.mjs --print`,
  then paste the private key into Vercel as `OPERATOR_JWT_PRIVATE_KEY`
  (**Production only**, never Preview) and the public key set into Convex prod as
  `OPERATOR_JWKS` (`npx convex env set --prod OPERATOR_JWKS "<value>"`). Do both
  **before** the deploy that contains this change; the deploy fails without
  `OPERATOR_JWKS`. Tabs open during that deploy need one reload.
- **Rotate** (only if a key may have leaked): re-run `--print`, replace both
  values, redeploy. Open tabs show "Session ended" until reloaded.
- **Check it:** `node scripts/verify-operator-auth.mjs` (local backend only unless
  `--allow-remote`) confirms anonymous, forged, expired and wrong-audience calls
  are refused and a valid token works.
- **CLI:** guarded functions need an identity:
  `npx convex run topics:list --identity issuer:https://solo-queue.operator`.
  Internal functions (`internal.*`) need none.
- **Adding a function:** build public ones with `operatorQuery` /
  `operatorMutation` / `operatorAction` from `convex/lib/operator.ts`, never the
  raw builders. `src/lib/operatorGuard.test.ts` fails if a raw builder appears
  outside `convex/waitlist.ts`.

## Weekly checklist (five lines)

1. **Tokens:** Today → Meta card. Both accounts show days left; reconnect (Settings → Connections) if either says "Needs you" or is under 21 days.
2. **Coverage:** Today → Queue runway. At least 7 days written on both platforms; fill gaps from Research or Studio.
3. **Receipts:** Publishing log (`/log`). No new PERMANENT or RETRYABLE rows since last week; heartbeat under 5 minutes.
4. **Hold:** the publisher pill is not ON HOLD. A failed post pauses the queue until it is retried or cancelled (Settings → Queue rules → Pause on failure).
5. **Backup:** Settings → Data & account → Download everything (JSON). Keep the latest file outside the app.

## If something is lost (backup and recovery)

Your published posts live on Threads and Instagram. Everything else (topics,
sources, drafts, the queue, frames, templates, settings, the publishing log and
hosted media) lives **only in the Convex deployment**. The JSON export in
Settings → Data & account is the one copy you control; it never contains tokens.
There is no import yet, so an export is a record to read, not a restore.

- **Tokens lost or expired (deployment fine):** Settings → Connections →
  Reconnect. Nothing else changes. A daily check refreshes any token that has
  less than a week left; a token that lapses anyway (the app was down, or the
  refresh failed) needs this reconnect.
- **Deployment lost:** create a new Convex project and deployment, set the
  Convex variables from the Environment table (names only here: `THREADS_*`,
  `IG_*`, `APP_BASE_URL`, `LLM_*`, `PUBLISH_DRY_RUN`, `OPERATOR_JWKS`), run
  `npx convex deploy`, point Vercel's `NEXT_PUBLIC_CONVEX_URL` and
  `CONVEX_DEPLOY_KEY` at it and redeploy, then Settings → Connections →
  Connect Threads and Instagram. The Meta app's redirect URIs only need
  changing if the app's domain changed. Start with `PUBLISH_DRY_RUN` unset
  (dry run) until a test post works.
- **Rehearsed on a fresh clone (2026-10-06):** `git clone`, `npm ci`,
  `npx tsc --noEmit` and `npx vitest run` all pass with no environment file at
  all. `npm run build` needs `NEXT_PUBLIC_CONVEX_URL` (Vercel sets it; for a
  local build, copy `.env.example` to `.env.local` first). The Meta
  reconnect itself can only be tried live.
- **What comes back by itself:** the default templates and story frames are
  recreated on first use. **What you re-enter:** voice, pillars, slots and rules
  (Settings), and anything queued. **What is gone:** the queue and drafts, the
  receipts, hosted media files. Keep the JSON export if you want the text of
  old drafts.

## Decisions closed (open questions)

- **OQ-001, LLM provider:** OpenRouter through the AI SDK's OpenAI-compatible
  provider, one pinned model in `LLM_MODEL` (swapping models is an env change,
  no code). **Chosen 2026-10-06 (founder): `meta/muse-spark-1.3-contributor`,**
  set in both the local and the production Convex environment. On OpenRouter
  that day it was listed at about $0.10 per million input tokens and $0.20 per
  million output tokens, with a 1M-token context; it is a reasoning model, so
  watch generation time against the 45-second target (TASK-042). Planned
  fallback, not set: `deepseek/deepseek-v4.1-flash` (about $0.30 / $1.20). The
  aim is the fastest model that stays cheap. **Still to record:** the cost per
  week after two weeks of real use (review about 2026-10-20), and a second
  topic generated on this model to confirm the drafts hold up.
- **OQ-002, Instagram login path:** the Instagram Login path (no Facebook Page)
  with the scopes `instagram_business_basic` and `instagram_business_content_publish`
  (`src/lib/oauth.ts`). A photo post with a caption published through it on
  2026-10-05, so no capability forced the Facebook Login fallback. Reels are
  not yet proven live (TASK-034).
- **OQ-003, media policy:** media is stored in Convex and served on a public
  link (primary). An external direct link to an image or video file is also
  accepted. Either kind must be verified (reachable, and an image or video) and
  the verification is good for 24 hours when a post is queued
  (`VERIFIED_TTL_MS`); the Instagram publisher checks the link is reachable
  again immediately before it posts and fails the slot, without posting, if it
  is not. Page links (YouTube, Drive, Vimeo) are refused.
- **OQ-004, default slot times:** ordered time lists per platform in
  Settings → Posting slots (the only place the defaults live; per-slot
  override stays available).

## Local backend trouble

If `npx convex dev` dies with `fetch failed` before doing anything, its
backend bootstrap is broken (seen when the binary cache is wiped or a new
backend version drops). Workaround that leaves everything else working:

```powershell
.\scripts\local-backend.ps1   # starts the backend from the cached binary
npx convex dev --once         # push + codegen while it's listening
```

Stop the backend afterwards (`Stop-Process -Name convex-local-backend`) so a
later `npx convex dev` doesn't collide on port 3210.

## Verifying in a browser

Client hydration does not run reliably under `npm run dev` in headless
sandbox environments (pages render but stay static: no badges, eternal
loading spinners, full-reload navigation — with zero console errors).
Verify interactive behavior against a production build instead:

```bash
npm run build
$env:BASIC_AUTH_USER = "localtest"; $env:BASIC_AUTH_PASS = "localtest123"
npm run start -- --port 3100   # sign in with the creds above
```
