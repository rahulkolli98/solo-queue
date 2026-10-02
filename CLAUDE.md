@AGENTS.md

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Solo Queue project rules

This repo is the Solo Queue app (Next.js + Convex + Vercel). `docs/` and `designs/` here are **junctions** to the planning workspace one level up (`..\docs`, `..\designs`); they are excluded from git on purpose. The roadmap is `docs/product-roadmap.md`, the specs are `docs/prd.md`, `docs/product-vision.md` and `docs/design.md`, and the handoff is `../HANDOFF.md`. Read `docs/reconcile-2026-10-01.md` before picking a task.

**Secrets and env**
- Never read the *values* in any `.env*` file or any Convex/Vercel env. Variable names only: `Get-Content .env.local | % { ($_ -split '=',2)[0] }` and `npx convex env list | % { ($_ -split '=',2)[0] }`.
- Never print, log or commit a token or secret. The user types secret values; the agent never sees them.

**Git and GitHub**
- The only GitHub account for this repo is `rahulkolli98`. The machine's active `gh` login is a different account, so never rely on the default. Do not run `gh auth switch`. For every `gh` or push command, use the per-command token:
  - `gh`: `$env:GH_TOKEN = (gh auth token --user rahulkolli98)` in the same call, then `gh ...`
  - push: `$env:GH_TOKEN = (gh auth token --user rahulkolli98); git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -u origin <branch>`
  - Confirm with `gh api user --jq .login` (must print `rahulkolli98`) before the first push of a session.
- Work on `phase-N/<slug>` branches (base: `rebuild/designs`). Open PRs against `main`. Never merge, never push to `main`, never force-push.
- The repo is public: no secrets, personal data or private planning detail in commits or PR text.
- End commit messages and PR bodies with the attribution lines the harness gives.

**Convex and production**
- "Dev" is a **local Convex backend** on this machine (`http://127.0.0.1:3210`, state in `.convex/local/default/`, gitignored), not a cloud deployment. Prod is the hosted Convex deployment that Vercel uses. If port 3210 is not listening, start the backend with `.\scripts\local-backend.ps1` (it loads `.env.local` without printing values), wait a few seconds, then run `npx convex dev --once` (or leave `npx convex dev` running). `npx convex ...` commands without `--prod` hit the local backend; Meta OAuth and real publishing cannot be tested there (HTTPS redirect URIs), only on prod.
- Never run `convex deploy`, `--prod` writes, or change Vercel settings unless the user asks. Prod holds real data: schema changes must be additive (`v.optional`, new tables), never narrowing.
- The new typed settings singleton is the table `appSettings`. The old key/value `settings` table is legacy and stays until a migration removes it.
- Publishing safety: the publisher must stay dry-run unless `PUBLISH_DRY_RUN=0` is set explicitly. Never set it to `0` on any deployment holding real Meta tokens until TASK-089 (gate the public Convex writes) is done. Public Convex functions are callable by anyone with the URL: anything that writes, publishes or deletes should be `internal*`.
- Landing site is a separate repo (`solo-queue-landing`); never run `npx convex dev` there.

**Roadmap**
- Mark a task `- [x]` in `docs/product-roadmap.md` only after it is verified (tests, `tsc`, lint, and a browser check for UI). Keep the `Status` line and the Decisions Log current; append to the Decisions Log, never rewrite it.
- Styling comes from the tokens in `docs/design.md` (Espresso Collage). No raw hex values or one-off inline styles in components.
