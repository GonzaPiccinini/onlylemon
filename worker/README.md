# Worker Boilerplate

Boilerplate minimo con TypeScript, Express, BullMQ, Prisma y Zod.

## Requisitos

- Node.js 20+
- PostgreSQL
- Redis

## Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

## Endpoints

- `GET /health`
- `POST /receive`
