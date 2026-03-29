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

## Scripts

- `npm run dev`: starts server in watch mode with tsx
- `npm run typecheck`: runs TypeScript checks
- `npm run build`: compiles to `dist/`
- `npm run start`: runs compiled project

## API

- `GET /api/health`

Example response:

```json
{
  "status": "ok",
  "bullmq": "up"
}
```
