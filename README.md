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
| `LLM_API_KEY` / `LLM_MODEL` | Draft generation provider key + model (swappable) | Vercel (Phase 2); Convex prod when drafting actions need it |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | Dashboard login (REQUIRED in production; omit only for local dev) | Vercel only |
| `OAUTH_STATE_SECRET` | Signs OAuth state cookies (REQUIRED for Connect flows; any 32-byte hex) | Vercel only |

Backend actions run on Convex Cloud and read **Convex** env vars — Vercel
vars never reach them. If a Meta flow fails with a bare server error, check
both sides (`npx convex env list --prod --names-only`).

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
