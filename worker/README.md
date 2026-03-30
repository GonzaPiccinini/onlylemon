# Worker

## Incluye

- Seguridad minima: `helmet`, `hpp`, `cors` por allowlist, `express-rate-limit`, limites de body JSON.
- Performance minima: `compression`, logs estructurados con `pino`, cierre graceful.
- Observabilidad minima: logs HTTP y health checks (`/health/live`, `/health/ready`).

## Requisitos

- Node.js 20+
- Postgres disponible y `DATABASE_URL` configurada

## Setup

1. Copia variables de entorno:

```bash
cp .env.example .env
```

2. Instala dependencias:

```bash
npm install
```

3. Genera Prisma Client:

```bash
npm run prisma:generate
```

4. Crea y aplica migracion inicial:

```bash
npm run prisma:migrate -- --name init
```

5. Levanta en desarrollo:

```bash
npm run dev
```

## Endpoints base

- `GET /health/live`
- `GET /health/ready`
- `POST /google/generate` body: `{ "prompt": "..." }`
- `POST /s3/upload-url` body: `{ "key": "...", "contentType": "..." }`
