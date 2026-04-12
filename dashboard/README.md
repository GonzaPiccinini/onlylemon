# Lemonbet Dashboard

Dashboard frontend para gestion de transacciones de casino virtual, implementado con React + shadcn y conectado a backend HTTP real.

## Ejecutar en local

```bash
npm install
cp .env.example .env
npm run dev
```

## Variables de entorno

```env
# opcional
# VITE_API_BASE_URL=http://localhost:3002/api
```

- `VITE_API_BASE_URL`: URL base del backend real.
  - Si no se define, el frontend usa automaticamente `http(s)://<host-actual>:3002/api`.
  - Esto permite login desde otros dispositivos (movil/laptop) sin hardcodear `localhost`.

## Backend esperado

El dashboard consume los siguientes grupos de endpoints:

- `/api/auth/*`
- `/api/admin/*`
- `/api/cashier/*`

## Notas

- Los endpoints del frontend estan centralizados en `src/api/endpoints.ts`.
- El formulario de carga de saldo requiere `userName` manual + `phoneId`/`phoneNumber` desde backend.
