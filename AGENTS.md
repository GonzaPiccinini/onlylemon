# AGENTS.md

## Repo shape
- There is no root `package.json`; run npm commands inside `dashboard/`, `gateway/`, or `worker/` (or with `npm --prefix <dir> ...`). Each service has its own `package-lock.json`.
- `dashboard/` is the React/Vite SPA; it consumes the worker API and SSE stream.
- `gateway/` is only the WAHA webhook ingress: validates `POST /api/webhook`, then enqueues BullMQ jobs in Redis.
- `worker/` is the business backend: Express API, BullMQ consumer, Prisma/Postgres, WAHA client, Meta Conversion events.
- Production is split across two compose files: `docker-compose.waha-vps.yml` owns Redis/WAHA/gateway; `docker-compose.dashboard-vps.yml` owns Postgres/worker/dashboard.
- Local dev has its own self-contained compose: `docker-compose.local.yml` (postgres + redis + gateway + worker + dashboard, with WAHA behind the `waha` profile). It mirrors prod images/config but uses no-password redis and bakes `VITE_API_BASE_URL=http://localhost:4000/api` into the dashboard build.

## CI/CD and deploy
- Three workflows in `.github/workflows/`:
  - `ci.yml` — runs on PRs and push to `main`: parallel `worker` (typecheck + test + build), `gateway` (lint + format:check + typecheck + build), `dashboard` (lint + build), plus a `ci-pass` summary job used as the required branch-protection check.
  - `release.yml` — on push to `main`: builds the 3 images with buildx (GHA cache), pushes to `ghcr.io/gonzapiccinini/onlylemon-{worker,gateway,dashboard}` tagged `:sha-<git-sha>` and `:latest`. Then SSHes into each VPS and runs `docker compose pull <service> && up -d` — gated by repo VAR `AUTO_DEPLOY=true`.
  - `rollback.yml` — manual `workflow_dispatch` with VPS + image tag inputs.
- Compose files reference `image: ghcr.io/...:${IMAGE_TAG:-latest}` alongside `build:`, so the VPS pulls images from GHCR and local `docker compose build` still works for development.
- Deploy script fetches `main` from GitHub via HTTPS using `GITHUB_TOKEN` embedded in the URL (`x-access-token`), then scrubs `.git/FETCH_HEAD` so the token does not persist on disk.
- Deploy `pull` only targets services we own (`worker`, `dashboard`, `gateway`); third-party images (postgres, redis, caddy, alloy, waha-plus) stay on whatever the VPS already has — particularly important for `devlikeapro/waha-plus:gows` which needs docker.io creds that live only on the VPS.
- For migrations, `worker/Dockerfile` runs `prisma migrate deploy` at container start; CI passes a dummy `DATABASE_URL` so `prisma generate` does not fail (matches the Dockerfile build stage).
- `worker/package.json` test script uses `find ... -print0 | xargs -0 tsx --test` (not the previous globstar pattern) so it works under `/bin/sh` (dash) on Ubuntu CI runners.

## Commands agents usually guess wrong
- Dashboard: `npm --prefix dashboard run dev`, `npm --prefix dashboard run build`, `npm --prefix dashboard run lint`.
- Gateway: `npm --prefix gateway run dev`, `npm --prefix gateway run typecheck`, `npm --prefix gateway run lint`, `npm --prefix gateway run format:check`, `npm --prefix gateway run build`. `npm --prefix gateway test` is a placeholder and does not run tests.
- Worker: `npm --prefix worker run dev`, `npm --prefix worker run prisma:generate`, `npm --prefix worker run typecheck`, `npm --prefix worker test`, `npm --prefix worker run build`.
- Focus a worker test with Node test globs, e.g. `npm --prefix worker test -- src/integrations/leads/service.test.ts`.
- After touching `worker/prisma/schema.prisma`, run `npm --prefix worker run prisma:generate`; migrations live in `worker/prisma/migrations/` and prod runs `prisma migrate deploy` at container start.

## Local setup gotchas
- Two ways to run locally: `docker-compose.local.yml` (full stack, recommended) or per-service `npm run dev` against standalone redis/postgres containers (README has the one-liners).
- Compose container naming is `onlylemon-{service}-local`; postgres breaks the pattern as `onlylemon-postgres-stack-local` to avoid clashing with any pre-existing `onlylemon-postgres-local` legacy container.
- Compose worker port is `4000` (matches prod); standalone `npm run dev` worker port is `3002` (Vite dashboard's default). Don't mix the two: a dashboard built with `VITE_API_BASE_URL=...:4000/api` won't talk to a `npm run dev` worker on `3002`.
- WAHA is behind a Compose profile (`--profile waha`) and uses the prod image `devlikeapro/waha-plus:gows`; `docker login` to docker.io with access to that private repo is required to pull it. Worker boots without WAHA — only WhatsApp calls fail at runtime.
- Worker zod schema requires all `WAHA_*` envs; the local compose passes dummy values so the worker boots even without the WAHA profile active.
- `worker/` intentionally has no `.env.example`; copy required vars from `worker/README.md`, `docker-compose.local.yml`, or `docker-compose.dashboard-vps.yml`.
- `gateway/` and `dashboard/` do have `.env.example` files.
- Dashboard `VITE_*` envs are build-time values, but `dashboard/src/config/env.ts` rewrites `localhost` API URLs to the browser host when testing from another device.

## Worker-specific constraints
- `worker/prisma/schema.prisma` generates Prisma client code to `worker/src/generated/prisma`, not the default `node_modules/.prisma` path.
- Worker TypeScript is `strict` and uses NodeNext ESM; imports normally include `.js` extensions in TS source.
- Tests use Node's built-in `node:test` via `tsx --test`; set env defaults before importing modules that read `src/config/env.ts` (many tests use dynamic `await import(...)` for this).
- `Lead.fbc` is not DB-unique in the current schema. Duplicate prevention is app-level only via `getLeadByFbc` + `LeadFbcConflictError` mapped to HTTP 409, so do not add a unique migration casually.
- `POST /api/leads` reads ad attribution from `utm_content` query param and merges it as `adCode`; query param wins over body.
- If a landing exists but has no active cashier, lead creation should still persist the lead and return an empty `number` so landings can use their fallback number. Only missing/disabled landings should fail creation.

## Style/tooling notes
- Gateway is CommonJS style config and enforces single quotes, semicolons, arrow parens, and Prettier (`gateway/.prettierrc.json`).
- Dashboard uses ESLint flat config for React/Vite; no test runner is configured there.
- Root README and service READMEs are high-signal and generally match executable config; prefer package scripts and compose files when docs conflict.
