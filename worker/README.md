# Worker

Núcleo de negocio de OnlyLemon. Combina tres responsabilidades en un solo proceso Node:

1. **API HTTP** para el dashboard (`/api/auth`, `/api/admin`, `/api/cashier`, `/api/leads`, `/api/realtime`).
2. **Consumer** de la cola BullMQ `inbound` (mensajes y `session.status` que publica el `gateway`).
3. **Integración** con WAHA (WhatsApp HTTP API) y con la Meta Conversion API (eventos `Lead` y `Contact`/`Purchase`).

**Stack**: Node.js 20 · TypeScript · Express 4 · Prisma 7 · PostgreSQL · BullMQ · Redis · Zod · Pino · JWT · prom-client

## Responsabilidades

- **Leads**: `POST /api/leads` crea un lead con un `code` único alfanumérico (8 chars, nanoid), asocia un cashier disponible para la landing (`metaPixelId`) y devuelve `{ code, number }`. Envía `Lead` a Meta Conversion API.
- **Matching de código ↔ teléfono**: cuando llega un mensaje de WhatsApp (desde la cola `inbound`), busca el `code` en el body, valida TTL (`LEADS_CODE_TTL_HOURS`) y marca el lead como `CONTACTED`. Envía `Contact` a Meta.
- **Auth**: login/logout con JWT (`JWT_SECRET`), soporte de roles `ADMIN` y `CASHIER`.
- **Admin**: CRUD de cashiers, landings, asociación cashier↔landing, estadísticas (`/stats/summary`, `/stats/cashiers`, `/stats/funds-series`), listado de leads.
- **Cashier**: sesiones de trabajo, cola de leads (current/convert/skip), historial, estado runtime, vinculación de WhatsApp (via WAHA: request-code, QR, session status).
- **Realtime**: SSE en `/api/realtime/cashier/runtime-state/stream` autenticado por JWT vía `?token=`. Heartbeat cada 20 s.
- **Idempotencia**: tabla `ProcessedJob` evita reprocesar el mismo webhook (jobKey = `event:id`).
- **Observabilidad**: `/metrics` Prometheus + logs pino.

## Estructura

```
worker/
├── prisma/
│   ├── schema.prisma                 User, Admin, Cashier, Lead, Landing, CashierLanding,
│   │                                 SessionActivity, ProcessedJob + enums
│   └── migrations/                   Histórico de migraciones Prisma
├── prisma.config.ts                  Datasource desde DATABASE_URL (dotenv)
└── src/
    ├── app/
    │   ├── server.ts                 Express listen + graceful shutdown (cierra worker BullMQ)
    │   └── worker.ts                 BullMQ Worker(inbound) → processInboundJob
    ├── config/env.ts                 Validación zod de envs
    ├── queues/inbound/
    │   └── processor.ts              Valida job (zod), idempotencia, routing por event
    ├── integrations/
    │   ├── leads/
    │   │   ├── service.ts            createLead, mapLeadCodeToPhone, TTL
    │   │   ├── http.ts               Handler HTTP POST /api/leads
    │   │   └── conversion.ts         Meta Conversion API (Lead / Contact)
    │   └── waha/client.ts            Cliente WAHA (sessions, QR, request-code, chats)
    ├── modules/
    │   ├── auth/                     POST /api/auth/login, GET /me, POST /logout
    │   ├── admin/                    /api/admin/* (requireRole ADMIN)
    │   ├── cashier/                  /api/cashier/* (requireRole CASHIER) + runtime-events
    │   ├── realtime/                 SSE JWT-authenticated
    │   ├── idempotency/              ProcessedJob helper
    │   └── security/
    │       ├── auth.middleware.ts    requireAuth, requireRole
    │       └── cors-origins.service.ts
    ├── persistence/                  Prisma client y repositories
    ├── middlewares/                  request-logging, error
    ├── lib/                          logger (pino), metrics (prom-client)
    └── generated/prisma/             Output de `prisma generate`
```

## Modelo de datos (resumen)

| Modelo | Propósito |
|---|---|
| `User` | Usuario base (admin o cashier). `username` único, password hasheado, `role`. |
| `Admin` | 1-1 con `User`. |
| `Cashier` | 1-1 con `User`. Contiene sesión de WAHA (`sessionName`), teléfono vinculado, estado (`ACTIVE`/`DISABLED`), contador de refresh de QR. |
| `SessionActivity` | Turnos de trabajo del cashier (start/end). |
| `Lead` | Lead generado por la landing (`code` único, `fbc`/`fbp`/`userAgent`, `metaPixelId`, `expiresAt`, `status`, `amount` al convertir, FK opcional a cashier). |
| `Landing` | Sitio de tracking con `metaPixelId`/`metaAccessToken` propios. |
| `CashierLanding` | Muchos-a-muchos entre cashier y landing. |
| `ProcessedJob` | Idempotencia: `jobKey` único por evento. |

Enums: `Role(ADMIN\|CASHIER)`, `CashierStatus(ACTIVE\|DISABLED)`, `LandingStatus(ACTIVE\|DISABLED)`, `LeadStatus(NOT_CONTACTED\|CONTACTED\|CONVERTED\|EXPIRED)`.

## Variables de entorno

Validadas con zod en `src/config/env.ts`. Si falta alguna, el proceso tira y no arranca.

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `PORT` | no | `3002` | Puerto HTTP. Prod: `4000`. |
| `DATABASE_URL` | sí | — | Postgres (`postgresql://user:pass@host:5432/db`). |
| `BULLMQ_REDIS_URL` | sí | — | Redis con credenciales. Prod: via IP Tailscale del `waha-vps`. |
| `BULLMQ_QUEUE_NAME` | sí | — | Mismo nombre que el gateway (ej: `inbound`). |
| `WORKER_CONCURRENCY` | no | `10` | Concurrencia del BullMQ Worker. |
| `LEADS_CODE_TTL_HOURS` | no | `24` | TTL del código de lead antes de expirar. |
| `JWT_SECRET` | sí | — | Mínimo 16 chars. Prod: 64 bytes aleatorios. |
| `CORS_ORIGIN` | no | `*` | Usado por el servicio `cors-origins`. |
| `WAHA_BASE_URL` | sí | — | URL del WAHA (prod: `https://waha.onlylemon.app`). |
| `WAHA_API_KEY` | sí | — | API key de WAHA. |
| `WAHA_WEBHOOK_URL` | sí | — | URL pública del gateway (`https://api.onlylemon.app/api/webhook`). Usada al crear sesiones en WAHA. |
| `WAHA_WEBHOOK_EVENTS` | sí | — | CSV de eventos que WAHA debe notificar (ej: `message,session.status`). |
| `WAHA_WEBHOOK_TOKEN_HEADER` | sí | — | Nombre del header que WAHA envía al gateway. |
| `WAHA_WEBHOOK_TOKEN_VALUE` | sí | — | Valor del token. Idéntico al que valida el gateway. |
| `META_PIXEL_ID` | no | — | Pixel ID de Meta (fallback si la landing no tiene uno propio). |
| `META_ACCESS_TOKEN` | no | — | Access token para Conversion API. |
| `META_API_VERSION` | no | `v21.0` | Versión del Graph API de Meta. |
| `LOG_LEVEL` | no | `info` | `fatal\|error\|warn\|info\|debug\|trace`. |

> Nota: el worker lee sus envs directamente desde `process.env`; no hay `.env.example` en el repo, tomar como referencia la tabla de arriba y/o `docker-compose.dashboard-vps.yml`.

## Scripts

```bash
npm run dev              # tsx watch src/app/server.ts
npm run build            # tsc → dist/
npm run start            # node dist/app/server.js
npm run typecheck        # tsc --noEmit
npm run prisma:generate  # prisma generate → src/generated/prisma
npm run test             # tsx --test src/**/*.test.ts
```

## Desarrollo local

Requisitos: Node 20+, Postgres 16, Redis 7.

```bash
# 1. Servicios externos
docker run -d --name ol-redis -p 6379:6379 redis:7-alpine
docker run -d --name ol-postgres -p 5432:5432 \
  -e POSTGRES_DB=onlylemon -e POSTGRES_USER=onlylemon -e POSTGRES_PASSWORD=onlylemon \
  postgres:16-alpine

# 2. Instalar
npm install
npm run prisma:generate

# 3. .env (crear a mano)
cat > .env <<'EOF'
PORT=3002
DATABASE_URL=postgresql://onlylemon:onlylemon@localhost:5432/onlylemon
BULLMQ_REDIS_URL=redis://localhost:6379
BULLMQ_QUEUE_NAME=inbound
WORKER_CONCURRENCY=5
LEADS_CODE_TTL_HOURS=48
JWT_SECRET=dev-jwt-secret-change-me-please
CORS_ORIGIN=http://localhost:5173
WAHA_BASE_URL=http://localhost:3001
WAHA_API_KEY=dev-waha-key
WAHA_WEBHOOK_URL=http://localhost:3000/api/webhook
WAHA_WEBHOOK_EVENTS=message,session.status
WAHA_WEBHOOK_TOKEN_HEADER=x-webhook-token
WAHA_WEBHOOK_TOKEN_VALUE=dev-token
LOG_LEVEL=debug
EOF

# 4. Migrar y correr
npx prisma migrate dev
npm run dev
```

El worker abre HTTP en `:3002` y se suscribe a la cola `inbound`. Para probar end-to-end local, levantar también el gateway apuntando al mismo Redis.

### Crear usuario admin inicial

No hay seed script commiteado; se puede crear con `prisma studio`, un SQL directo o un script propio. Ejemplo vía `psql`:

```sql
INSERT INTO "User" (id, name, username, password, role, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'root', 'root', '<bcrypt-hash>', 'ADMIN', now(), now());
INSERT INTO "Admin" (id, "userId", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), (SELECT id FROM "User" WHERE username='root'), now(), now());
```

## Endpoints HTTP

### Health & operaciones

| Método | Path | Descripción |
|---|---|---|
| GET | `/health` | Ping a Postgres (`SELECT 1`). `200/503`. |
| GET | `/metrics` | Registro Prometheus. |
| POST | `/receive` | Stub legacy (202). |

### Public

| Método | Path | Descripción |
|---|---|---|
| POST | `/api/leads` | Crea un lead. Body: `{ fbc, fbp, userAgent, metaPixelId }`. Devuelve `{ code, number }`. Errores: `400` inválido, `404` landing no encontrada, `409` sin cashier disponible. |

### Auth

| Método | Path | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login. Devuelve JWT. |
| GET | `/api/auth/me` | Usuario autenticado. |
| POST | `/api/auth/logout` | Invalida token. |

### Admin (`requireRole('ADMIN')`)

Cashiers: `GET/POST /api/admin/cashiers`, `PUT /:id`, `PATCH /:id/disable|enable`, `GET/PUT /:id/landings`.
Landings: `GET/POST /api/admin/landings`, `PUT /:id`, `PATCH /:id/disable|enable`.
Stats: `GET /api/admin/stats/summary|cashiers|funds-series`.
Leads: `GET /api/admin/leads`.

### Cashier (`requireRole('CASHIER')`)

Sesiones: `GET /api/cashier/sessions`, `GET /sessions/current`, `POST /sessions/start|finish`.
Cola de leads: `GET /leads/queue/current`, `POST /leads/:leadId/convert|skip`, `GET /leads`.
Runtime: `GET /runtime-state`, `PATCH /account`.
WhatsApp (WAHA): `GET /whatsapp/link-state|link/status`, `POST /whatsapp/link/start|refresh|reset|complete`.

### Realtime (SSE)

`GET /api/realtime/cashier/runtime-state/stream?token=<JWT>` → stream de eventos `runtime-state` + `ping` cada 20 s. Solo rol `CASHIER`.

## Cola BullMQ — `inbound`

El worker registra un `BullMQ.Worker` sobre `BULLMQ_QUEUE_NAME`. Cada job se valida con uno de estos dos esquemas:

```ts
// mensaje de WhatsApp
{ event?: 'message'|'message.any', session, payload: { id, from, body? } }

// status de sesión
{ event: 'session.status', session, timestamp?, payload: { status, statuses? } }
```

El `jobKey` para idempotencia combina `event` + `id` (o session+status+timestamp). Si ya existe en `ProcessedJob`, se skipea.

- `message.*` → `mapLeadsToPhone(session, from, body)` busca el código en el body y matchea con el lead correspondiente.
- `session.status` → `processWhatsappSessionStatusService` actualiza el estado del enlace de WhatsApp del cashier.

Reintentos: gobernados por el gateway al encolar (`attempts=3`, backoff exponencial 1 s).

## Métricas expuestas en `/metrics`

Business:
- `leads_created_total{meta_pixel_id}`
- `leads_matched_total{result}` (`MATCHED`, `NO_CODE`, `error`, ...)
- `leads_converted_total{meta_pixel_id}`
- `lead_conversion_amount_ars{meta_pixel_id}` (histogram ARS)
- `meta_conversion_events_total{event_type,result}`
- `meta_conversion_duration_seconds{event_type}` (histogram)

Técnicas:
- `lead_code_collisions_total`
- `bullmq_jobs_total{result,event_type}` (`completed`, `failed`, `duplicate`, `parse_error`)
- `bullmq_job_duration_seconds{event_type}` (histogram)
- `http_request_duration_seconds{method,route,status_code}` (histogram)
- Métricas default de Node.

## Producción

### Dockerfile

Multi-stage Alpine. En el stage `build` se ejecuta `npx prisma generate` con un `DATABASE_URL` dummy (Prisma necesita la var en tiempo de build). El runtime copia `node_modules` completo (incluye `prisma` CLI para correr `migrate deploy` al arrancar):

```
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/app/server.js"]
```

Usa `USER node` y expone `4000`.

```bash
docker build -t onlylemon-worker ./worker
docker run --rm -p 4000:4000 --env-file worker/.env onlylemon-worker
```

### Compose (dashboard-vps)

El worker vive en `docker-compose.dashboard-vps.yml` junto con `postgres`, `dashboard` y `caddy`.

- Depende de `postgres` con `service_healthy` (healthcheck `pg_isready`).
- `BULLMQ_REDIS_URL` apunta a la IP Tailscale del `waha-vps` (`redis://:PASS@${WAHA_VPS_TS_IP}:6379`).
- Caddy hace reverse-proxy de `/api/*` y `/api/realtime/*` a `worker:4000` (con `flush_interval -1` para SSE).

```bash
# En dashboard-vps
docker compose -f docker-compose.dashboard-vps.yml up -d --build worker
docker compose -f docker-compose.dashboard-vps.yml logs -f worker | grep migration
```

### Migraciones en producción

Se aplican automáticamente al iniciar el container (`prisma migrate deploy`). Para forzar manualmente:

```bash
docker compose -f docker-compose.dashboard-vps.yml exec worker \
  node_modules/.bin/prisma migrate deploy
```

### Backups

`infra/dashboard-vps/backup.sh` hace `pg_dump` diario por cron (`0 5 * * *`) y lo sube a Cloudflare R2 con `rclone`. Retención: 3 días local, 30 días remoto. Ver [`../docs/production-deployment.md`](../docs/production-deployment.md#fase-7--backup-diario-a-cloudflare-r2) para setup completo de `rclone` y el crontab.

### Observabilidad

- Logs JSON con pino → stdout → Alloy → Loki.
- Métricas scrapeadas por Alloy cada 30 s (job `worker` en `infra/dashboard-vps/alloy.config`).

### Checklist de seguridad específico del worker

- `JWT_SECRET >= 64 bytes` aleatorios.
- `DATABASE_URL` nunca expuesto: Postgres bindeado a `127.0.0.1` en el host.
- `BULLMQ_REDIS_URL` viaja por Tailscale (no por internet público).
- `WAHA_API_KEY` y `WAHA_WEBHOOK_TOKEN_VALUE` rotables vía `.env`.
- `META_ACCESS_TOKEN` opcional: si no existe, la integración se desactiva gracefully (`hasMetaConversionConfig`).
- Container corre como non-root.

## Referencias

- [`../docs/production-deployment.md`](../docs/production-deployment.md) — runbook de despliegue completo.
- [`../gateway/README.md`](../gateway/README.md) — productor de la cola `inbound`.
- [`../dashboard/README.md`](../dashboard/README.md) — consumidor de la API del worker.
