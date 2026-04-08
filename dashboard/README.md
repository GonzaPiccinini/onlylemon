# Lemonbet Dashboard

Dashboard frontend para gestion de transacciones de casino virtual, implementado con React, shadcn y consumo HTTP.

## Ejecutar en local

```bash
npm install
npm run dev
```

Por defecto se ejecuta con mocks activos (`VITE_USE_MOCKS=true`) para permitir pruebas sin backend.

## Variables de entorno

Crea un archivo `.env` en esta carpeta con:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_USE_MOCKS=true
VITE_MOCK_DELAY_MS=450
```

- `VITE_API_BASE_URL`: base URL del backend real o mockeado.
- `VITE_USE_MOCKS`: `true` para MSW, `false` para backend real.
- `VITE_MOCK_DELAY_MS`: latencia artificial de respuestas mock.

## Usuarios de prueba (MSW)

- Admin
  - Usuario: `admin`
  - Password: `admin123`
- Cajero 1
  - Usuario: `cashier`
  - Password: `cashier123`
- Cajero 2
  - Usuario: `martin`
  - Password: `cashier123`

## Que cubre el mock

- Auth: login, me, logout.
- Admin: listar/crear/editar/deshabilitar cajeros.
- Admin stats: resumen, comparativa por cajero, serie de cargas por periodo.
- Cajero: iniciar/finalizar sesion, consultar sesiones, registrar cargas, historial.

## Notas

- Todos los endpoints estan centralizados en `src/api/endpoints.ts`.
- Para usar backend real, pon `VITE_USE_MOCKS=false` y ajusta `VITE_API_BASE_URL`.
