# Lemon Backend Gateway

Proyecto base de backend con **Node.js + TypeScript + Express + BullMQ**.

## Requisitos

- Node.js 20+
- Redis ejecutándose localmente o accesible por URL (backend de BullMQ)

## Instalacion

```bash
npm install
cp .env.example .env
```

## Variables de entorno

- `PORT`: puerto del servidor HTTP (por defecto `3000`)
- `BULLMQ_REDIS_URL`: URL de conexion a Redis para BullMQ (por defecto `redis://localhost:6379`)
- `BULLMQ_QUEUE_NAME`: nombre de la cola para jobs del webhook (por defecto `waha-messages`)
- `WEBHOOK_TOKEN`: token estatico requerido en el header `x-webhook-token` para `POST /api/webhook`
- `CORS_ALLOWED_ORIGINS`: lista de origenes permitidos separada por comas para clientes web (ejemplo: `http://172.18.0.10:3000,http://172.18.0.20:5173`)
- `MAX_PAYLOAD_BYTES`: tamano maximo aceptado para payload JSON (por defecto `262144`)
- `QUEUE_MAX_BACKLOG`: maximo de jobs `waiting + delayed + active` antes de responder `429` en webhook (por defecto `50000`)
- `QUEUE_DEGRADED_BACKLOG`: umbral de backlog para estado de salud `degraded` (por defecto `20000`)

## Scripts

- `npm run dev`: inicia el servidor en modo watch con tsx
- `npm run typecheck`: ejecuta chequeos de TypeScript
- `npm run build`: compila a `dist/`
- `npm run start`: ejecuta el proyecto compilado

## API

- `GET /api/health`

La respuesta de health incluye metricas de cola y disponibilidad:

Ejemplo de respuesta:

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

Requiere header:

```text
x-webhook-token: <WEBHOOK_TOKEN>
```

Nota: CORS solo afecta requests desde navegador y no reemplaza la validacion del token del webhook.
