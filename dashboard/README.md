# Dashboard

Single-page application de OnlyLemon para **administradores** y **cajeros**. Consume la API HTTP del `worker` (`/api/auth`, `/api/admin`, `/api/cashier`) y un stream SSE (`/api/realtime`) para el estado en vivo del cashier.

**Stack**: React 19 · Vite 8 · TypeScript · React Router 7 · TanStack Query 5 · React Hook Form · Zod · shadcn/ui · TailwindCSS 4 · Axios · date-fns · Recharts · Sonner (toasts)

## Features

### Admin — Landings y teléfonos de fallback

Cada fila de la tabla de landings en `/admin/landings` incluye un panel expandible con la lista de teléfonos de respaldo (`LandingFallbackPhone`) de esa landing: permite agregar, editar y eliminar números. El último número no puede eliminarse (el botón queda deshabilitado y el backend devuelve `409 LAST_FALLBACK`). El formulario de creación de landing requiere al menos un teléfono de fallback válido antes de habilitarse el botón de guardar; el formulario de edición no incluye esta sección (los fallbacks existentes se administran desde el panel expandible).

### Admin — Filtro de leads: RECARGA

La vista de leads en `/admin/leads` incluye el filtro **RECARGA** (compradores repetidos: leads con `status = CONVERTED` y más de una conversión). Es independiente del filtro **Convertido** (primera conversión). Seleccionar ambos juntos devuelve todos los leads convertidos sin distinción.

### Rutas

```
/                            AuthRedirect (decide login o home por rol)
/login                       Login
/admin                       Cashiers (ADMIN)
/admin/stats                 Estadísticas (ADMIN)
/admin/landings              Landings (ADMIN)
/admin/leads                 Leads (ADMIN)
/cashier                     Sesión activa + cola de leads (CASHIER)
/cashier/add-funds           Conversión de lead / carga de saldo (CASHIER)
/cashier/history             Historial (CASHIER)
/cashier/account             Cuenta + vinculación WhatsApp (CASHIER)
```

Guards: `RoleGuard` por ruta (`ADMIN`/`CASHIER`) y `AppShell` común con sidebar.

### Integración con el backend

- Endpoints centralizados en `src/api/endpoints.ts`.
- Cliente HTTP `src/api/http.ts` (axios) con `baseURL = env.apiBaseUrl` y manejo de JWT.
- Servicios por dominio: `auth.service.ts`, `admin.service.ts`, `cashier.service.ts`.
- Estado servidor con **TanStack Query**; estado local con React Hook Form + Zod.
- SSE al worker vía `env.realtimeBaseUrl` (`/cashier/runtime-state/stream?token=<JWT>`).

## Estructura

```
dashboard/src
├── main.tsx
├── App.tsx                   QueryClientProvider + AuthProvider + Router + Toaster
├── app/
│   └── router.tsx            react-router tree + role guards
├── api/
│   ├── http.ts               axios instance + interceptors
│   ├── endpoints.ts          paths del backend (single source of truth)
│   ├── auth.service.ts
│   ├── admin.service.ts
│   └── cashier.service.ts
├── config/
│   └── env.ts                VITE_API_BASE_URL + VITE_REALTIME_BASE_URL (con fallback por hostname)
├── features/
│   ├── auth/                 login-page + auth-context
│   ├── admin/                cashiers | landings | leads | stats pages + hooks
│   └── cashier/              session | add-funds | history | account pages + hooks
├── components/
│   ├── app/                  app-shell, auth-redirect, role-guard
│   └── ui/                   shadcn components
├── lib/                      utilidades (query-client, formatters, ...)
├── types/                    tipos compartidos
├── assets/                   imágenes
└── index.css                 Tailwind base + tema
```

## Variables de entorno

Archivo de referencia: `.env.example`.

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `VITE_API_BASE_URL` | no | `http(s)://<host-actual>:3002/api` | Base URL de la API del worker. Si no se define, el frontend la infiere en runtime usando `window.location.hostname`, lo que permite usar el dashboard desde otro dispositivo de la red sin hardcodear `localhost`. |
| `VITE_REALTIME_BASE_URL` | no | `http(s)://<host-actual>:3002/api/realtime` | Base URL para el stream SSE. Mismo fallback por hostname. |

> Las variables `VITE_*` son inyectadas **en tiempo de build**. En Docker, pasar `--build-arg VITE_API_BASE_URL=...` (ya está cableado en `Dockerfile` y en el compose de producción).

Comportamiento especial: si la base URL configurada apunta a `localhost`/`127.0.0.1` pero el navegador accede desde otra IP, `src/config/env.ts` reescribe el hostname automáticamente.

## Scripts

```bash
npm run dev        # vite --host (expone en 0.0.0.0 para acceder desde otros dispositivos)
npm run build      # tsc -b && vite build → dist/
npm run preview    # vite preview
npm run lint       # eslint .
```

## Desarrollo local

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env
# (opcional) editar .env para apuntar a otro worker
npm run dev
```

Por default `vite --host` sirve en `http://localhost:5173`. El dashboard asume que el worker está en `http://localhost:3002/api` (puerto default del worker en dev). Si corrés el worker en otro puerto, fijá `VITE_API_BASE_URL=http://localhost:<puerto>/api`.

### Backend esperado

- `POST /api/auth/login` devuelve un JWT que se guarda y se envía en `Authorization: Bearer ...`.
- Todos los endpoints listados en `src/api/endpoints.ts` (auth, admin, cashier).
- SSE en `/api/realtime/cashier/runtime-state/stream?token=<JWT>`.

Detalles en [`../worker/README.md`](../worker/README.md).

## Producción

### Build

El build produce assets estáticos en `dist/` con `tsc -b && vite build`. Las envs `VITE_*` quedan inlineadas en los bundles.

### Docker

`Dockerfile` multi-stage: build con Node, runtime con **Caddy 2 alpine** sirviendo los assets estáticos y un `Caddyfile` embebido que soporta SPA routing:

```
:80 {
  root * /srv
  encode zstd gzip
  try_files {path} /index.html
  file_server
}
```

Build con la URL de la API de producción:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://app.onlylemon.app/api \
  -t onlylemon-dashboard ./dashboard

docker run --rm -p 8080:80 onlylemon-dashboard
```

### Compose (dashboard-vps)

En `docker-compose.dashboard-vps.yml` el servicio `dashboard` declara tanto `image:` (lo que se pullea en prod) como `build:` (fallback para build local):

```yaml
image: ghcr.io/gonzapiccinini/onlylemon-dashboard:${IMAGE_TAG:-latest}
build:
  context: ./dashboard
  args:
    VITE_API_BASE_URL: ${VITE_API_BASE_URL}
```

Caddy del VPS (no el embebido) termina TLS en `app.onlylemon.app` y hace `reverse_proxy dashboard:80` para las rutas de la SPA, y `reverse_proxy worker:4000` para `/api/*` y `/api/realtime/*` (con `flush_interval -1` para el SSE). Ver [`../infra/dashboard-vps/Caddyfile`](../infra/dashboard-vps/Caddyfile).

El Caddyfile del VPS setea `Content-Security-Policy` estricto que permite `connect-src` a `https://app.onlylemon.app` y `wss://app.onlylemon.app`.

### Deploy a producción

El deploy es automático vía GitHub Actions (`.github/workflows/release.yml`). El build de la imagen se hace en CI con `VITE_API_BASE_URL=https://app.onlylemon.app/api` cableado en el workflow (no leído de un `.env`); la URL queda inlineada en los bundles JavaScript. Si cambia el dominio del API, hay que actualizarlo en `.github/workflows/release.yml`.

El VPS solo hace `docker compose pull dashboard && up -d`; no buildea localmente en producción.

### Headers de seguridad (provistos por Caddy del VPS)

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` con whitelist a `'self'`, imágenes data/https, conexiones solo al propio host.

## Convenciones internas

- Formularios: React Hook Form + Zod resolvers.
- Fetching: TanStack Query (hooks por dominio en `features/*/hooks.ts`).
- Errores HTTP: se transforman en toasts con Sonner.
- Formato de fechas: `date-fns`.
- UI: componentes shadcn en `src/components/ui/`.

## Referencias

- [`../worker/README.md`](../worker/README.md) — API HTTP que este dashboard consume.
- [`../docs/production-deployment.md`](../docs/production-deployment.md) — despliegue completo end-to-end.
