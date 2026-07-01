# Rollout Runbook — pixel-normalization-rekey (#75) + landing-embed-loader (#81)

**Strategy:** single coordinated **maintenance window** (both changes deploy together).
**Why a window:** the worker `CMD` is `prisma migrate deploy && node server`, and the new image ships **both** the `expand` and `contract` migrations. A plain start would run them back-to-back and `contract` would fail (`NOT NULL` before backfill). So migrations are applied **manually and in order**: `expand → backfill → contract`, *then* the worker is started.

Migration dirs:
- expand: `20260629120000_pixel_normalization_expand`
- contract: `20260630120001_pixel_normalization_contract`

Host: **dashboard-vps** (runs `worker` + `postgres`). Commands below assume `docker-compose.dashboard-vps.yml`. Postgres user/db are **`onlylemon` / `onlylemon`** (from the compose); local socket uses trust auth, so no password is needed. (Robust alternative that avoids hardcoding: wrap in `sh -c '... -U "$POSTGRES_USER" -d "$POSTGRES_DB" ...'` so the creds are read inside the container.)

---

## 0. Prerequisites (before the window)

> **⚠️ CRÍTICO — Worker NO debe arrancarse hasta §6.** El worker arranca con `CMD: prisma migrate deploy && node server`. La imagen nueva trae las migraciones `expand` + `contract`. Si el worker se levanta antes del backfill, correrá las DOS migraciones sin el backfill en el medio y **contract fallará** (`NOT NULL` sobre rows vacíos). **NO ejecutar `docker compose up worker` hasta DESPUÉS** de completar expand → backfill → contract con `migrate resolve --applied` (§3, §4, §5). Todas las migraciones se aplican con el worker DETENIDO. Nota: `prisma db execute` en Prisma 7 **no acepta `--schema`**; el backfill va por SQL crudo porque el script `.ts` no está en la imagen.

- [ ] PR #83 merged to `main`; CI built & pushed new `worker` + `dashboard` images to ghcr.
- [ ] Generate a strong Altcha secret: `openssl rand -hex 32`.
- [ ] On dashboard-vps `.env`: add `ALTCHA_HMAC_SECRET=<that value>`; remove `TURNSTILE_SECRET_KEY`. (The bundle needs no secret — server-side only.)
- [ ] Have the **embed snippet per active landing** ready (from the admin "Snippet de integración" panel, or generate the list of active landing UUIDs). Pick a **mode** per landing (`solo-logica` / `widget-automontado` / `boton-flotante`).
- [ ] Schedule the window at **low-traffic** time (lead creation is paused during it).

## 1. Start window — pause lead creation + backup
```bash
# stop the worker (serves /api/leads) and gateway (inbound webhooks)
docker compose -f docker-compose.dashboard-vps.yml stop worker
# gateway runs on waha-vps:
# docker compose -f docker-compose.waha-vps.yml stop gateway

# FULL DB backup (point of no return safety)
# dump straight to a host file via stdout (-T = clean binary; no in-container file or cp)
docker compose -f docker-compose.dashboard-vps.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > pre-rekey-$(date +%F).dump
# sanity-check the dump
ls -lh pre-rekey-*.dump
```

> **Gate de validación del backup:** Antes de continuar, confirmar que el dump:
> 1. Tiene un **timestamp anterior** al inicio de la migración (no es un dump tomado después de que la migración ya empezó — los backups diarios en R2/local `infra/dashboard-vps/backup.sh` (`onlylemonbackup<ts>.sql.gz`) son la fuente confiable pre-migración).
> 2. Es **legible**: `pg_restore --list pre-rekey-<date>.dump | head -20` (debe listar tablas; para `.sql.gz`: `gunzip -t pre-rekey-<date>.dump`). No continuar si el archivo está corrupto.

## 2. Pull new images (do NOT start worker yet)
```bash
docker compose -f docker-compose.dashboard-vps.yml pull worker dashboard
```

## 3. Apply EXPAND (additive) — SQL + mark applied
```bash
# apply the expand SQL using the prisma CLI inside a one-off worker container
docker compose -f docker-compose.dashboard-vps.yml run --rm --no-deps worker \
  node_modules/.bin/prisma db execute \
  --file prisma/migrations/20260629120000_pixel_normalization_expand/migration.sql

# record it as applied (so the worker's migrate deploy won't re-run it)
docker compose -f docker-compose.dashboard-vps.yml run --rm --no-deps worker \
  node_modules/.bin/prisma migrate resolve \
  --applied 20260629120000_pixel_normalization_expand
```

## 4. BACKFILL (raw SQL — the .ts script is not in the image)
```bash
docker compose -f docker-compose.dashboard-vps.yml exec -T postgres \
  psql -U onlylemon -d onlylemon <<'SQL'
-- 1) one MetaPixel per distinct (pixel number, access token)
INSERT INTO "MetaPixel" (id, "pixelId", "accessToken", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "metaPixelId", "metaAccessToken", NOW(), NOW()
FROM "Landing"
GROUP BY "metaPixelId", "metaAccessToken"
ON CONFLICT ("pixelId") DO NOTHING;

-- 2) point each Landing at its MetaPixel
UPDATE "Landing" l
SET "metaPixelRef" = mp.id
FROM "MetaPixel" mp
WHERE mp."pixelId" = l."metaPixelId" AND l."metaPixelRef" IS NULL;

-- 3) snapshot every Lead (incl. NOT_CONTACTED in flight)
UPDATE "Lead" ld
SET "metaPixelRef" = l."metaPixelRef", "landingId" = l.id, "eventSourceUrl" = l.url
FROM "Landing" l
WHERE l."metaPixelId" = ld."metaPixelId" AND ld."metaPixelRef" IS NULL;
SQL
```

### 4b. GATE — verify no NULLs remain (contract will fail otherwise)
```bash
docker compose -f docker-compose.dashboard-vps.yml exec -T postgres \
  psql -U onlylemon -d onlylemon -c \
  'SELECT
     (SELECT count(*) FROM "Landing" WHERE "metaPixelRef" IS NULL) AS landings_null,
     (SELECT count(*) FROM "Lead" WHERE "metaPixelRef" IS NULL OR "landingId" IS NULL OR "eventSourceUrl" IS NULL) AS leads_null;'
```
**Both must be 0.** If `leads_null > 0` there are orphan leads (old pixel number with no matching landing) — investigate; either fix their mapping or delete those rows before continuing. **Do NOT run contract until both are 0.**

## 5. Apply CONTRACT (tighten + drop legacy) — SQL + mark applied
```bash
docker compose -f docker-compose.dashboard-vps.yml run --rm --no-deps worker \
  node_modules/.bin/prisma db execute \
  --file prisma/migrations/20260630120001_pixel_normalization_contract/migration.sql

docker compose -f docker-compose.dashboard-vps.yml run --rm --no-deps worker \
  node_modules/.bin/prisma migrate resolve \
  --applied 20260630120001_pixel_normalization_contract
```

## 5b. Actualizar rutas de Caddy (antes de iniciar el worker)
Sin este paso, `/embed/*` y `/altcha/*` devuelven 404 en prod aunque el worker esté OK — Caddy los envía al dashboard en vez del worker.
```bash
# en dashboard-vps, editar infra/dashboard-vps/Caddyfile para agregar:
#
#   handle /embed/* {
#       reverse_proxy worker:4000
#   }
#
#   handle /altcha/* {
#       reverse_proxy worker:4000
#   }
#
# (deben ir junto a handle /api/* y ANTES del handle {} catch-all)

caddy validate --config /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile
```
Confirmación: `curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/altcha/challenge` debe devolver algo distinto de 404 (tipicamente 200 una vez el worker esté up, o connection refused si todavía no arrancó — lo que importa es que no haga 404 desde Caddy).

## 6. Start new worker + dashboard
```bash
docker compose -f docker-compose.dashboard-vps.yml up -d worker dashboard
# worker's `prisma migrate deploy` on start is now a no-op (all applied)
# restart gateway if it was stopped:
# docker compose -f docker-compose.waha-vps.yml up -d gateway
```
Confirm boot:
```bash
docker compose -f docker-compose.dashboard-vps.yml logs worker --tail 30   # "server listening", no migrate errors, no ENOTFOUND redis
curl -s -o /dev/null -w "%{http_code}\n" https://<worker-host>/altcha/challenge   # 200
```

## 7. Swap ALL active landings to the embed
For **every** ACTIVE landing, replace the old inline block on its page with the one-liner from the admin snippet panel:
```html
<script src="https://<worker-host>/embed/<landingId>.js" data-cta-mode="<mode>" async></script>
<!-- widget-automontado also needs: <div id="cta-root"></div> -->
<!-- solo-logica needs the owner's [data-cta] button + [data-cta-captcha] container -->
```
**Critical:** the worker is now `landingId`-only. Any landing still on the **old inline** code (sends `metaPixelId`, no `landingId`) returns **400/404** → its leads break. Keep lead creation paused until every active landing is swapped. Track with a checklist of landing UUIDs.

## 8. Smoke test (prod)
- Open one swapped landing → click the CTA → confirm WhatsApp opens with `CODIGO:xxxx`.
- Verify the lead + snapshot + CAPI event:
```bash
docker compose -f docker-compose.dashboard-vps.yml exec -T postgres \
  psql -U onlylemon -d onlylemon -c \
  'SELECT code,"landingId","metaPixelId","eventSourceUrl",status FROM "Lead" ORDER BY "createdAt" DESC LIMIT 3;'
docker compose -f docker-compose.dashboard-vps.yml logs worker --since 5m | grep -i conversion   # real CAPI POST (META_DRY_RUN should be false/unset in prod)
```

## 9. Resume
Once all landings are swapped and smoke passes, the system is live. Lead creation resumes automatically (worker is up).

---

## Rollback (if a step before §6 fails)
- The DB is still on the old schema until contract (§5). Restore from the backup if needed:
```bash
docker compose -f docker-compose.dashboard-vps.yml cp ./pre-rekey-<date>.dump postgres:/tmp/restore.dump
docker compose -f docker-compose.dashboard-vps.yml exec postgres \
  pg_restore -U onlylemon -d onlylemon --clean --if-exists /tmp/restore.dump
```
- Re-deploy the **previous** worker/dashboard image tags and restart. Landings still on the old inline code keep working against the old worker.
- After §6 (contract applied + new worker live), rollback means restore-from-backup + redeploy old images (the contract drop is destructive). Prefer fixing forward.

## Post-rollout
- [ ] Confirm `META_DRY_RUN` is **not** `true` in prod (so CAPI events actually fire).
- [ ] Decommission `TURNSTILE_SECRET_KEY` everywhere; the Cloudflare Turnstile widget can be deleted.
- [ ] Monitor `/api/leads` 4xx/5xx and worker logs for any landing still on old code.
- [ ] Follow-up: styles pass (dashboard + embed bundle).
