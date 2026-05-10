# Dashboard VPS — Operations Runbook

## Post-deploy: Timezone verification

After deploying worker and/or gateway, confirm that the TZ environment variable is set correctly in the running containers.

**Worker (dashboard-vps):**
```
docker exec onlylemon-worker printenv TZ
```
Expected output: `America/Argentina/Buenos_Aires`

**Gateway (waha-vps):**
```
docker exec onlylemon-gateway printenv TZ
```
Expected output: `America/Argentina/Buenos_Aires`

If either command returns empty or a different value, check the Dockerfile (`ENV TZ=America/Argentina/Buenos_Aires`) and the compose `environment:` block for that service.

---

## Pre-deploy gate: landing fallback phones

For any deploy that includes the `add_landing_fallback_phone` migration, a mandatory backfill gate must be completed **before** deploying the new worker image. The hard invariant is: every Landing must have ≥1 `LandingFallbackPhone` row. Missing rows cause `HTTP 500 FALLBACK_INVARIANT_VIOLATION` on `POST /api/leads` when no cashier is available.

Strict deploy order: `prisma migrate deploy` → `npm run seed:fallbacks` → `npm run audit:fallbacks` (must exit 0) → deploy worker → deploy dashboard.

Full procedure, SSH tunnel pattern, and rollback notes: [`docs/production-deployment.md` — Fase 8b](../../docs/production-deployment.md#fase-8b----puerta-pre-deploy-teléfonos-de-fallback-por-landing).

---

## Postgres TZ policy

Postgres is deliberately left without a `TZ` environment variable. **Do NOT add `TZ` to the postgres service** without first migrating all affected columns to `timestamptz`.

**Why:** Setting `TZ=America/Argentina/Buenos_Aires` on the postgres service would shift every server-side `NOW()` default by -3h relative to UTC. This happens because Prisma declares `@default(now())` columns (e.g. `createdAt`, `updatedAt`) as `timestamp(3)` — timestamp WITHOUT time zone. Postgres coerces `timestamptz` to `timestamp` using the session timezone when inserting, so a non-UTC session TZ silently corrupts those column values by -3h.

Postgres stays in UTC default. See design ADR-5 for full rationale.

**Safe path for the future:** if the schema is migrated to `@db.Timestamptz` on all affected columns, the coercion drift disappears and setting `TZ` on postgres becomes safe (cosmetic only).
