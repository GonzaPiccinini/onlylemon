# Casino AI Backend

Base backend project with **Node.js + TypeScript + Express + BullMQ**.

## Requirements

- Node.js 20+
- Redis running locally or accessible via URL (BullMQ backend)

## Setup

```bash
npm install
cp .env.example .env
```

## Environment variables

- `PORT`: HTTP server port (default `3000`)
- `BULLMQ_REDIS_URL`: Redis connection URL for BullMQ (default `redis://localhost:6379`)
- `BULLMQ_QUEUE_NAME`: queue name for webhook jobs (default `waha-messages`)
- `WEBHOOK_TOKEN`: static token required in header `x-webhook-token` for `POST /api/webhook`
- `CORS_ALLOWED_ORIGINS`: comma-separated list of allowed origins for browser clients (example: `http://172.18.0.10:3000,http://172.18.0.20:5173`)
- `MAX_PAYLOAD_BYTES`: maximum accepted JSON payload size (default `262144`)
- `QUEUE_MAX_BACKLOG`: maximum `waiting + delayed + active` jobs before returning `429` on webhook (default `50000`)
- `QUEUE_DEGRADED_BACKLOG`: backlog threshold for health status `degraded` (default `20000`)

## Scripts

- `npm run dev`: starts server in watch mode with tsx
- `npm run typecheck`: runs TypeScript checks
- `npm run build`: compiles to `dist/`
- `npm run start`: runs compiled project

## API

- `GET /api/health`

Health response includes queue stats and availability:

Example response:

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

- `POST /api/webhook`

Requires header:

```text
x-webhook-token: <WEBHOOK_TOKEN>
```

Note: CORS only affects browser-based requests and does not replace webhook token validation.
