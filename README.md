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

1. La landing llama `POST /api/leads` en el `worker` con `fbc`, `fbp`, `userAgent`, `metaPixelId` → el worker genera un `code` único, selecciona un cashier elegible y devuelve `{ code, number }`.
2. El usuario escribe al WhatsApp del cashier con ese `code`.
3. WAHA dispara un webhook a `https://api.onlylemon.app/api/webhook` (autenticado con `x-webhook-token`).
4. El `gateway` valida el token, valida el JSON, y encola el evento en BullMQ (`inbound`) con `attempts=3` y backoff exponencial.
5. El `worker` consume la cola: matchea el `code` con un lead existente, marca el lead como `CONTACTED` y envía `Lead` a la Meta Conversion API.
6. Eventos `session.status` de WAHA actualizan el estado del enlace de WhatsApp del cashier.
7. El cashier usa el dashboard para convertir leads (`/api/cashier/leads/:id/convert`), y el worker envía `Purchase` (Contact) a Meta.

## Desarrollo local

Cada servicio tiene su propio `README.md` con instrucciones. Setup mínimo global:

```bash
# 1. Redis y Postgres locales (o contenedores)
docker run -d --name ol-redis -p 6379:6379 redis:7-alpine
docker run -d --name ol-postgres -p 5432:5432 \
  -e POSTGRES_DB=onlylemon -e POSTGRES_USER=onlylemon -e POSTGRES_PASSWORD=onlylemon \
  postgres:16-alpine

# 2. Instalar dependencias y levantar cada servicio en su propia terminal
cd gateway   && cp .env.example .env && npm install && npm run dev
cd worker    && cp .env.example .env && npm install && npm run prisma:generate && npm run dev
cd dashboard && cp .env.example .env && npm install && npm run dev
```

Puertos por defecto en dev:

| Servicio | Puerto |
|---|---|
| gateway | `3000` (configurable con `PORT`) |
| worker | `3002` (default del schema; en prod corre en `4000`) |
| dashboard | `5173` (Vite) — consume `http://<host>:3002/api` |

## Producción

- Imágenes y deploy: `docker-compose.waha-vps.yml` y `docker-compose.dashboard-vps.yml` en la raíz.
- Infra por VPS: `infra/waha-vps/` y `infra/dashboard-vps/` (Caddyfile, alloy.config, backup.sh).
- Guía completa paso a paso: [`docs/production-deployment.md`](./docs/production-deployment.md).

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
META_PIXEL_ID / META_ACCESS_TOKEN / META_API_VERSION
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
├── dashboard/                        SPA React
├── gateway/                          Webhook receiver
├── worker/                           API + Queue consumer + Prisma
├── infra/
│   ├── waha-vps/                     Caddyfile + alloy.config
│   └── dashboard-vps/                Caddyfile + alloy.config + backup.sh
├── docs/
│   └── production-deployment.md      Runbook completo de despliegue
├── docker-compose.waha-vps.yml
├── docker-compose.dashboard-vps.yml
└── README.md                         ← este archivo
```
