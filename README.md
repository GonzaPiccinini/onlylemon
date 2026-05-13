# OnlyLemon — Monorepo

Monorepo de la plataforma **OnlyLemon**: captura de leads desde landings, matcheo automático de códigos con mensajes de WhatsApp y panel operativo para cajeros y administradores.

## Servicios

| Servicio | Runtime | Descripción | README |
|---|---|---|---|
| `gateway/` | Node.js + Express + BullMQ (producer) | Recibe webhooks de WAHA y los encola en Redis/BullMQ para que el worker los consuma. | [`gateway/README.md`](./gateway/README.md) |
| `worker/` | Node.js + Express + BullMQ (consumer) + Prisma + Postgres | API HTTP del dashboard (auth, admin, cashier, realtime), consumidor de la cola `inbound` y módulo de integración con WAHA y con la Meta Conversion API. | [`worker/README.md`](./worker/README.md) |
| `dashboard/` | React + Vite + TanStack Query + shadcn/ui | SPA para administradores y cajeros. Consume la API HTTP del `worker`. | [`dashboard/README.md`](./dashboard/README.md) |
| `infra/` | Caddy + Grafana Alloy + backup.sh | Archivos de infraestructura por VPS (Caddyfile, alloy.config, backup a R2). | — |
| `docs/` | — | Guía extendida de despliegue a producción. | [`docs/production-deployment.md`](./docs/production-deployment.md) |

## Arquitectura (producción)

```
                         Internet
                            │
    ┌───────────────────────┴───────────────────────┐
    ▼                                               ▼
 VPS waha-vps                                 VPS dashboard-vps
 Caddy (443) ──► gateway:3000                 Caddy (443) ──► dashboard:80 (SPA)
                │                                             └► worker:4000 (/api/*)
                ▼                                               │
               Redis ◄───── Tailscale ───────────────────────── ┘
                 ▲                                            postgres:5432
                 │                                             (127.0.0.1)
                WAHA (WhatsApp HTTP API)
```

- **waha-vps**: Redis, WAHA y el `gateway` que recibe webhooks (`api.onlylemon.app`, `waha.onlylemon.app`).
- **dashboard-vps**: Postgres, `worker` y la SPA `dashboard` (`app.onlylemon.app`).
- **Red privada**: Tailscale conecta ambos VPS; el worker consume Redis del otro VPS por la IP `100.x.x.x`.
- **Observabilidad**: Grafana Alloy en cada VPS shipea métricas Prometheus (`/metrics`) y logs de los containers a Grafana Cloud.
- **Backups**: `backup.sh` en el VPS del dashboard hace `pg_dump` diario a Cloudflare R2.

Diagramas y pasos detallados: [`docs/production-deployment.md`](./docs/production-deployment.md).

## Flujo de datos (happy path)

1. La landing llama `POST /api/leads` en el `worker` con `fbc`, `fbp`, `userAgent`, `metaPixelId` → el worker genera un `code` único, selecciona un número de WhatsApp mediante una cadena de 3 niveles (cajero en turno → cajero conectado → teléfono de fallback de la landing) y devuelve `{ code, number }` con `number` siempre no vacío.
2. El usuario escribe al WhatsApp del cashier con ese `code`.
3. WAHA dispara un webhook a `https://api.onlylemon.app/api/webhook` (autenticado con `x-webhook-token`).
4. El `gateway` valida el token, valida el JSON, y encola el evento en BullMQ (`inbound`) con `attempts=3` y backoff exponencial.
5. El `worker` consume la cola: matchea el `code` con un lead existente, marca el lead como `CONTACTED` y envía `Lead` a la Meta Conversion API.
6. Eventos `session.status` de WAHA actualizan el estado del enlace de WhatsApp del cashier.
7. El cashier usa el dashboard para convertir leads (`/api/cashier/leads/:id/convert`), y el worker envía `Purchase` (Contact) a Meta.

## Desarrollo local

Hay dos caminos según lo que quieras hacer.

### Opción A — Stack completo con Docker Compose (recomendado)

`docker-compose.local.yml` levanta postgres + redis + gateway + worker + dashboard buildeados desde el repo, todo en una red `onlylemon-local`:

```bash
docker compose -f docker-compose.local.yml up --build
# WAHA detrás de un profile (requiere docker login a docker.io con acceso a waha-plus:gows):
docker compose -f docker-compose.local.yml --profile waha up --build
```

Inspeccionar la config resuelta (con o sin profile):

```bash
docker compose -f docker-compose.local.yml --profile waha config
```

Puertos en `127.0.0.1`:

| Servicio | Puerto host | Container |
|---|---|---|
| dashboard (Caddy) | `8080` | `onlylemon-dashboard-local` |
| worker | `4000` | `onlylemon-worker-local` |
| gateway | `3000` | `onlylemon-gateway-local` |
| postgres | `5432` | `onlylemon-postgres-stack-local` |
| redis | `6379` | `onlylemon-redis-local` |
| waha (profile) | `3001` | `onlylemon-waha-local` |

Características:

- Postgres con volumen named `pg_data` (persistente entre `up`/`down`). Credenciales: `onlylemon` / `onlylemon` / `onlylemon`.
- Redis sin password (a diferencia de prod).
- El worker corre `prisma migrate deploy` al iniciar (idempotente sobre una DB ya migrada).
- Dashboard se buildea con `VITE_API_BASE_URL=http://localhost:4000/api` (build-time arg).
- WAHA usa `devlikeapro/waha-plus:gows` (mismo image que prod). Si no tenés acceso, omití `--profile waha`; el worker arranca igual y solo fallarán las llamadas a WhatsApp.

Importar un dump de prod al postgres del compose:

```bash
docker exec -i onlylemon-postgres-stack-local psql -U onlylemon -d onlylemon -v ON_ERROR_STOP=1 < dump.sql
```

### Opción B — Servicios uno a uno con `npm run dev`

Útil para HMR del dashboard o para iterar rápido sin buildear imágenes:

```bash
# 1. Redis y Postgres locales (o contenedores standalone)
docker run -d --name ol-redis -p 6379:6379 redis:7-alpine
docker run -d --name ol-postgres -p 5432:5432 \
  -e POSTGRES_DB=onlylemon -e POSTGRES_USER=onlylemon -e POSTGRES_PASSWORD=onlylemon \
  postgres:16-alpine

# 2. Cada servicio en su propia terminal
cd gateway   && cp .env.example .env && npm install && npm run dev
cd worker    &&                         npm install && npm run prisma:generate && npm run dev   # ver worker/README.md para .env
cd dashboard && cp .env.example .env && npm install && npm run dev
```

Puertos por defecto en este modo:

| Servicio | Puerto |
|---|---|
| gateway | `3000` |
| worker | `3002` (default del schema; el compose y prod usan `4000`) |
| dashboard | `5173` (Vite) — consume `http://<host>:3002/api` |

## Producción

- **Pipeline CI/CD** (GitHub Actions, ver `.github/workflows/`): push a `main` → `ci.yml` corre lint/typecheck/test/build en paralelo para los 3 servicios → `release.yml` buildea y pushea las imágenes a GHCR (`ghcr.io/gonzapiccinini/onlylemon-{worker,gateway,dashboard}` con tags `:sha-<git-sha>` y `:latest`) → si la repo VAR `AUTO_DEPLOY=true`, hace SSH a cada VPS y corre `docker compose pull <servicio> && up -d`.
- **Rollback**: workflow manual `rollback.yml` (Actions → Run workflow), recibe el VPS y el image tag (puede ser un SHA previo o `rollback-pre-cicd`).
- **Compose files**: `docker-compose.waha-vps.yml` (Redis + WAHA + gateway) y `docker-compose.dashboard-vps.yml` (Postgres + worker + dashboard) en la raíz. Cada servicio referencia tanto `image:` (lo que se pullea en prod) como `build:` (para builds locales con `docker compose build`).
- **Infra por VPS**: `infra/waha-vps/` y `infra/dashboard-vps/` (Caddyfile, alloy.config, backup.sh).
- **Setup inicial paso a paso** (provisioning, Tailscale, secretos, hardening): [`docs/production-deployment.md`](./docs/production-deployment.md).

Secretos requeridos en producción (cada VPS carga su subset vía `.env` con `chmod 600`):

```
# Comunes
REDIS_PASSWORD
BULLMQ_QUEUE_NAME
WAHA_API_KEY
WEBHOOK_TOKEN_HEADER
WEBHOOK_TOKEN_VALUE
WAHA_WEBHOOK_TOKEN_HEADER
WAHA_WEBHOOK_TOKEN_VALUE
GRAFANA_PROM_URL / GRAFANA_PROM_USER / GRAFANA_PROM_TOKEN
GRAFANA_LOKI_URL / GRAFANA_LOKI_USER / GRAFANA_LOKI_TOKEN
LOG_LEVEL

# waha-vps
WAHA_VPS_TS_IP             # IP Tailscale donde bindeamos Redis
WAHA_BASE_URL
WAHA_DASHBOARD_USERNAME / WAHA_DASHBOARD_PASSWORD
WHATSAPP_SWAGGER_USERNAME / WHATSAPP_SWAGGER_PASSWORD
WAHA_DASHBOARD_ENABLED / WHATSAPP_SWAGGER_ENABLED
WHATSAPP_DEFAULT_ENGINE / WAHA_NAMESPACE
WAHA_LOG_FORMAT / WAHA_LOG_LEVEL / WAHA_PRINT_QR
CORS_ALLOWED_ORIGINS
MAX_PAYLOAD_BYTES / QUEUE_MAX_BACKLOG / QUEUE_DEGRADED_BACKLOG

# dashboard-vps
POSTGRES_PASSWORD
WORKER_CONCURRENCY
LEADS_CODE_TTL_HOURS
WAHA_WEBHOOK_URL
WAHA_WEBHOOK_EVENTS
JWT_SECRET
CORS_ORIGIN
VITE_API_BASE_URL
META_API_VERSION
```

## Dominios

- `app.onlylemon.app` — Dashboard + `/api/*` del worker + `/api/realtime/*` (SSE)
- `api.onlylemon.app` — Gateway (webhook público)
- `waha.onlylemon.app` — Dashboard y Swagger de WAHA (HTTP Basic)

## Observabilidad

- `/metrics` (Prometheus) expuesto por `gateway` y `worker`.
- Logs estructurados (pino) por stdout → Docker → Alloy → Loki.
- Métricas clave: `webhooks_enqueued_total`, `webhooks_rejected_total`, `bullmq_jobs_total`, `leads_created_total`, `leads_matched_total`, `leads_converted_total`, `meta_conversion_events_total`, `http_request_duration_seconds`.

## Estructura del repo

```
onlylemon/
├── .github/
│   └── workflows/
│       ├── ci.yml                    Lint/typecheck/test/build por servicio
│       ├── release.yml               Build + push a GHCR + SSH deploy a ambos VPS
│       └── rollback.yml              Rollback manual por VPS y tag
├── dashboard/                        SPA React
├── gateway/                          Webhook receiver
├── worker/                           API + Queue consumer + Prisma
├── infra/
│   ├── waha-vps/                     Caddyfile + alloy.config
│   └── dashboard-vps/                Caddyfile + alloy.config + backup.sh
├── docs/
│   └── production-deployment.md      Runbook completo de despliegue
├── docker-compose.local.yml          Stack local self-contained (postgres + redis + servicios)
├── docker-compose.waha-vps.yml
├── docker-compose.dashboard-vps.yml
├── AGENTS.md                         Guía rápida para agentes IA
└── README.md                         ← este archivo
```
