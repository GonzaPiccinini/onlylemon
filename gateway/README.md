# Gateway

Servicio HTTP que recibe webhooks de WAHA (WhatsApp HTTP API) y los encola en **BullMQ/Redis** para que el `worker` los procese de forma asíncrona. También expone métricas Prometheus y un endpoint de health con estadísticas de la cola.

**Stack**: Node.js 20 · TypeScript · Express 5 · BullMQ · Redis · Zod · Pino · prom-client

## Responsabilidades

- Recibir `POST /api/webhook` autenticado con un header estático (`x-webhook-token`).
- Validar origen (CORS) y tamaño del payload (`MAX_PAYLOAD_BYTES`).
- Rechazar con `429` cuando el backlog de la cola supera `QUEUE_MAX_BACKLOG` (backpressure).
- Encolar el evento en la cola BullMQ configurada (`BULLMQ_QUEUE_NAME`) con `attempts=3` y backoff exponencial.
- Exponer `GET /api/health` con estado de Redis/BullMQ y contadores de la cola (`waiting`, `delayed`, `active`, `failed`, `backlog`).
- Exponer `GET /metrics` para scrape de Prometheus/Alloy.

## Estructura

```
gateway/src
├── server.ts                              entrypoint, listen + graceful shutdown
├── app.ts                                 construcción de la app Express
├── config/
│   ├── env.ts                             validación de envs con zod
│   └── bullmq.ts                          Queue singleton + stats + shutdown
├── routes/
│   ├── health.routes.ts                   GET /api/health
│   ├── webhook.routes.ts                  POST /api/webhook
│   └── metrics.routes.ts                  GET /metrics
├── services/
│   ├── health.service.ts                  chequeo de BullMQ y umbral degraded
│   └── webhook.service.ts                 validación de backlog + enqueue
├── middlewares/
│   ├── webhook-auth.middleware.ts         timingSafeEqual del token
│   ├── require-json.middleware.ts
│   └── request-logging.middleware.ts      pino + x-request-id
└── lib/
    ├── logger.ts                          pino
    └── metrics.ts                         prom-client registry
```

## Variables de entorno

Todas son validadas por zod al arrancar. Si falta alguna, el proceso sale.

| Variable                 | Tipo       | Descripción                                                                                                       |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `PORT`                   | number     | Puerto HTTP del servidor. Prod: `3000`.                                                                           |
| `BULLMQ_REDIS_URL`       | string     | URL de Redis (ej: `redis://:password@redis:6379`).                                                                |
| `BULLMQ_QUEUE_NAME`      | string     | Nombre de la cola. Debe coincidir con la del worker (`inbound`).                                                  |
| `WEBHOOK_TOKEN_HEADER`   | string     | Nombre del header esperado (ej: `x-webhook-token`).                                                               |
| `WEBHOOK_TOKEN_VALUE`    | string     | Valor del token compartido con WAHA.                                                                              |
| `MAX_PAYLOAD_BYTES`      | number     | Límite de body JSON. Prod sugerido: `1048576`.                                                                    |
| `QUEUE_MAX_BACKLOG`      | number     | Backlog máximo (waiting+delayed+active) antes de devolver `429`.                                                  |
| `QUEUE_DEGRADED_BACKLOG` | number     | Umbral para marcar `availability=degraded` en `/api/health`.                                                      |
| `CORS_ALLOWED_ORIGINS`   | csv string | Orígenes permitidos para navegadores, separados por coma. Requests sin `Origin` (server-to-server) pasan siempre. |
| `LOG_LEVEL`              | enum       | `fatal \| error \| warn \| info \| debug \| trace`. Default: `info`.                                              |

Archivo de referencia: `.env.example`.

## Scripts

```bash
npm run dev          # tsx watch src/server.ts
npm run typecheck    # tsc --noEmit
npm run build        # tsc → dist/
npm run start        # node dist/server.js
npm run lint         # eslint src/**/*.ts
npm run format       # prettier --write
```

## Desarrollo local

Requisitos: Node 20+, Redis corriendo (`redis://localhost:6379`).

```bash
cp .env.example .env
# editar .env con valores de dev (ver ejemplo abajo)
npm install
npm run dev
```

`.env` de ejemplo para dev:

```env
PORT=3000
BULLMQ_REDIS_URL=redis://localhost:6379
BULLMQ_QUEUE_NAME=inbound
WEBHOOK_TOKEN_HEADER=x-webhook-token
WEBHOOK_TOKEN_VALUE=dev-token
CORS_ALLOWED_ORIGINS=http://localhost:5173
MAX_PAYLOAD_BYTES=1048576
QUEUE_MAX_BACKLOG=10000
QUEUE_DEGRADED_BACKLOG=5000
LOG_LEVEL=debug
```

Enviar un webhook de prueba:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-token: dev-token" \
  -d '{"event":"message","session":"default","payload":{"id":"abc","from":"5491100000000@c.us","body":"test CODE123"}}'
```

## API

### `GET /api/health`

Respuesta:

```json
{
  "status": "ok",
  "bullmq": "up",
  "availability": "ok",
  "queue": {
    "waiting": 0,
    "delayed": 0,
    "active": 0,
    "failed": 0,
    "backlog": 0
  }
}
```

- `503` si BullMQ/Redis no responde.
- `availability: degraded` cuando `backlog >= QUEUE_DEGRADED_BACKLOG`.

### `POST /api/webhook`

Headers:

```
Content-Type: application/json
x-webhook-token: <WEBHOOK_TOKEN_VALUE>
```

Body: cualquier JSON. Si el objeto tiene `event: string`, ese valor se usa como `job.name` en BullMQ; si no, se usa `message`.

Respuestas:

| Código | Condición                                                            |
| ------ | -------------------------------------------------------------------- |
| `200`  | Evento encolado (`{ message: "Webhook data stored successfully" }`). |
| `401`  | Token inválido o ausente. Comparación con `timingSafeEqual`.         |
| `403`  | CORS: origen no permitido.                                           |
| `413`  | Payload > `MAX_PAYLOAD_BYTES`.                                       |
| `415`  | `Content-Type` distinto de `application/json`.                       |
| `429`  | Backlog saturado (`>= QUEUE_MAX_BACKLOG`).                           |
| `500`  | Error al encolar.                                                    |

### `GET /metrics`

Expone el registro Prometheus con `service=gateway` como default label:

- `webhooks_enqueued_total{event_type}` — counter
- `webhooks_rejected_total{reason}` — counter (`queue_saturated`, `enqueue_error`, ...)
- `http_request_duration_seconds{method,route,status_code}` — histogram
- Métricas default de Node.js (`process_*`, `nodejs_*`).

## Producción

### Docker

`Dockerfile` multi-stage: build con `node:20-alpine`, runtime con dependencias de prod solamente, corre como usuario `node` y escucha en `3000`.

```bash
docker build -t onlylemon-gateway ./gateway
docker run --rm -p 3000:3000 --env-file gateway/.env onlylemon-gateway
```

### Compose (waha-vps)

El gateway vive en `docker-compose.waha-vps.yml` junto con `redis`, `waha` y `caddy`. Caddy termina TLS en `api.onlylemon.app` y hace reverse-proxy a `gateway:3000` (ver `infra/waha-vps/Caddyfile`).

Orden de dependencias: `redis` debe estar `healthy` antes de levantar el gateway.

```bash
# En waha-vps
docker compose -f docker-compose.waha-vps.yml up -d --build gateway
docker compose -f docker-compose.waha-vps.yml logs -f gateway
```

### Seguridad

- Token del webhook comparado con `timingSafeEqual` (evita leaks por side-channel).
- CORS estricto por whitelist (`CORS_ALLOWED_ORIGINS`).
- `express.json({ limit: MAX_PAYLOAD_BYTES })` bloquea payloads grandes antes de parsearlos.
- Backpressure con `QUEUE_MAX_BACKLOG` para evitar OOM si el worker cae.
- Container corre como non-root.

### Observabilidad

- Logs JSON con pino a stdout; Alloy los levanta desde Docker y los envía a Loki.
- `/metrics` scrapeado por Alloy cada 30 s (`infra/waha-vps/alloy.config`, job `gateway`).

## Flujo end-to-end relevante

```
WAHA ──(x-webhook-token)──► Caddy ──► gateway:3000 ──► Redis (queue=inbound) ──► worker
                                                       ▲
                                                       └── health / metrics → Alloy → Grafana Cloud
```

Ver documento general: [`../docs/production-deployment.md`](../docs/production-deployment.md).
