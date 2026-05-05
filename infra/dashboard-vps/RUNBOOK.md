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

## Postgres TZ policy

Postgres is deliberately left without a `TZ` environment variable. **Do NOT add `TZ` to the postgres service** without first migrating all affected columns to `timestamptz`.

**Why:** Setting `TZ=America/Argentina/Buenos_Aires` on the postgres service would shift every server-side `NOW()` default by -3h relative to UTC. This happens because Prisma declares `@default(now())` columns (e.g. `createdAt`, `updatedAt`) as `timestamp(3)` — timestamp WITHOUT time zone. Postgres coerces `timestamptz` to `timestamp` using the session timezone when inserting, so a non-UTC session TZ silently corrupts those column values by -3h.

Postgres stays in UTC default. See design ADR-5 for full rationale.

**Safe path for the future:** if the schema is migrated to `@db.Timestamptz` on all affected columns, the coercion drift disappears and setting `TZ` on postgres becomes safe (cosmetic only).
