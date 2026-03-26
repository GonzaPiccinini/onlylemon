# Casino AI Backend

Base backend project with **Node.js + TypeScript + Express + Redis**.

## Requirements

- Node.js 20+
- Redis running locally or accessible via URL

## Setup

```bash
npm install
cp .env.example .env
```

## Environment variables

- `PORT`: HTTP server port (default `3000`)
- `REDIS_URL`: Redis connection URL (default `redis://localhost:6379`)

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
  "redis": "up"
}
```
