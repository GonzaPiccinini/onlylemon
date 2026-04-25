# AGENTS.md

## Repo shape
- There is no root `package.json`; run npm commands inside `dashboard/`, `gateway/`, or `worker/` (or with `npm --prefix <dir> ...`). Each service has its own `package-lock.json`.
- `dashboard/` is the React/Vite SPA; it consumes the worker API and SSE stream.
- `gateway/` is only the WAHA webhook ingress: validates `POST /api/webhook`, then enqueues BullMQ jobs in Redis.
- `worker/` is the business backend: Express API, BullMQ consumer, Prisma/Postgres, WAHA client, Meta Conversion events.
- Production is split across two compose files: `docker-compose.waha-vps.yml` owns Redis/WAHA/gateway; `docker-compose.dashboard-vps.yml` owns Postgres/worker/dashboard.

## Commands agents usually guess wrong
- Dashboard: `npm --prefix dashboard run dev`, `npm --prefix dashboard run build`, `npm --prefix dashboard run lint`.
- Gateway: `npm --prefix gateway run dev`, `npm --prefix gateway run typecheck`, `npm --prefix gateway run lint`, `npm --prefix gateway run format:check`, `npm --prefix gateway run build`. `npm --prefix gateway test` is a placeholder and does not run tests.
- Worker: `npm --prefix worker run dev`, `npm --prefix worker run prisma:generate`, `npm --prefix worker run typecheck`, `npm --prefix worker test`, `npm --prefix worker run build`.
- Focus a worker test with Node test globs, e.g. `npm --prefix worker test -- src/integrations/leads/service.test.ts`.
- After touching `worker/prisma/schema.prisma`, run `npm --prefix worker run prisma:generate`; migrations live in `worker/prisma/migrations/` and prod runs `prisma migrate deploy` at container start.

## Local setup gotchas
- Local external services are Redis 7 on `localhost:6379` and Postgres 16 on `localhost:5432`; the README has docker one-liners.
- `worker/` intentionally has no `.env.example`; copy required vars from `worker/README.md` or `docker-compose.dashboard-vps.yml`.
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
