# Plan de despliegue a producción — casino-ai

## Arquitectura objetivo

```
Internet
   │
   ├──> VPS1 (edge) ── Caddy ──> WAHA + Gateway
   │                   │
   │                   └── Redis (solo red privada Tailscale)
   │
   └──> VPS2 (app)  ── Caddy ──> Dashboard (SPA) + Worker (API)
                       │
                       └── Postgres (solo localhost)

VPS1 ↔ VPS2: Tailscale (100.x.x.x) — Worker consume Redis vía IP Tailscale
```

---

## Fase 0 — Prerrequisitos (antes de tocar los VPS)

1. **Dominios**: registrar 3 subdominios (ej. `api.tudominio.com` → VPS1, `app.tudominio.com` → VPS2, `waha.tudominio.com` → VPS1). Apuntar registros A a las IPs públicas.
2. **Grafana Cloud**: crear cuenta free tier → obtener:
   - Prometheus remote write URL + user + API token
   - Loki push URL + user + API token
3. **Tailscale**: crear cuenta, generar **2 auth keys** (uno por VPS, reutilizable, ephemeral=false).
4. **Cloudflare R2**: crear bucket `casino-ai-backups`, generar Access Key ID + Secret (con permiso solo a ese bucket).
5. **Secrets a generar localmente** (guardar en un password manager):
   - `JWT_SECRET` (openssl rand -hex 64)
   - `WEBHOOK_TOKEN_VALUE` (openssl rand -hex 32)
   - `WAHA_WEBHOOK_TOKEN_VALUE` (openssl rand -hex 32)
   - `WAHA_API_KEY` (openssl rand -hex 32)
   - `POSTGRES_PASSWORD` (openssl rand -hex 32)
   - `REDIS_PASSWORD` (openssl rand -hex 32)
6. **Meta Pixel**: confirmar `META_PIXEL_ID` y `META_ACCESS_TOKEN` de producción.

---

## Fase 1 — Hardening base de ambos VPS

Ejecutar en **cada VPS** como root recién provisionado:

```bash
# 1. Actualizar
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades curl

# 2. Crear usuario no-root con sudo
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

# 3. SSH por llave solamente
mkdir -p /home/deploy/.ssh
# (pegar tu clave pública en authorized_keys)
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 4. Deshabilitar login root + password auth
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# 5. Firewall — solo 22, 80, 443 públicos
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 6. fail2ban para SSH
systemctl enable --now fail2ban

# 7. Auto-updates de seguridad
dpkg-reconfigure -plow unattended-upgrades
```

Probar acceso SSH con el usuario `deploy` antes de cerrar la sesión root.

---

## Fase 2 — Red privada entre VPS con Tailscale

En **ambos VPS**:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-xxx --ssh=false --hostname=vps1  # o vps2
tailscale ip -4   # anotar IPs: 100.x.x.x
```

Anotar:
- `VPS1_TS_IP` (donde corre Redis)
- `VPS2_TS_IP` (donde corre Worker)

UFW no bloquea `tailscale0`; Redis escuchará **solo** en esa interfaz.

---

## Fase 3 — Dockerfiles (crear en el repo)

### `gateway/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### `worker/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app/server.js"]
```

### `dashboard/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/dist /usr/share/caddy
```

### `.dockerignore` (en cada servicio)

```
node_modules
dist
.env*
.git
*.log
```

---

## Fase 4 — Docker Compose

### VPS1 — `~/casino-ai/docker-compose.yml`

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: always
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --bind 0.0.0.0
      --protected-mode yes
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "${VPS1_TS_IP}:6379:6379"   # solo expuesto por Tailscale
    networks: [backend]

  waha:
    image: devlikeapro/waha:latest
    restart: always
    environment:
      WAHA_API_KEY: ${WAHA_API_KEY}
      WAHA_PRINT_QR: "false"
      WHATSAPP_HOOK_URL: https://api.tudominio.com/webhook
      WHATSAPP_HOOK_EVENTS: message,session.status
    volumes:
      - waha_data:/app/.sessions
    networks: [backend]

  gateway:
    build: ./gateway
    restart: always
    environment:
      PORT: 3000
      WEBHOOK_TOKEN_HEADER: X-Webhook-Token
      WEBHOOK_TOKEN_VALUE: ${WEBHOOK_TOKEN_VALUE}
      BULLMQ_REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      BULLMQ_QUEUE_NAME: inbound
      CORS_ALLOWED_ORIGINS: https://app.tudominio.com
      MAX_PAYLOAD_BYTES: 1048576
      QUEUE_MAX_BACKLOG: 10000
      QUEUE_DEGRADED_BACKLOG: 5000
      LOG_LEVEL: info
    depends_on: [redis]
    networks: [backend]

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [gateway, waha]
    networks: [backend]

  alloy:
    image: grafana/alloy:latest
    restart: always
    command: run --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy
    volumes:
      - ./alloy.config:/etc/alloy/config.alloy:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock
    networks: [backend]

volumes:
  redis_data:
  waha_data:
  caddy_data:
  caddy_config:

networks:
  backend:
    driver: bridge
```

### VPS1 — `~/casino-ai/Caddyfile`

```caddy
api.tudominio.com {
    encode zstd gzip
    reverse_proxy gateway:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}

waha.tudominio.com {
    encode zstd gzip
    basicauth {
        admin {env.WAHA_BASIC_AUTH_HASH}
    }
    reverse_proxy waha:3000
}
```

### VPS2 — `~/casino-ai/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: casino_ai
      POSTGRES_USER: casino_ai
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"   # SOLO localhost
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U casino_ai"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [backend]

  worker:
    build: ./worker
    restart: always
    environment:
      PORT: 4000
      DATABASE_URL: postgresql://casino_ai:${POSTGRES_PASSWORD}@postgres:5432/casino_ai
      BULLMQ_REDIS_URL: redis://:${REDIS_PASSWORD}@${VPS1_TS_IP}:6379
      BULLMQ_QUEUE_NAME: inbound
      WORKER_CONCURRENCY: 5
      LEADS_CODE_TTL_HOURS: 48
      WAHA_API_KEY: ${WAHA_API_KEY}
      WAHA_BASE_URL: https://waha.tudominio.com
      WAHA_WEBHOOK_URL: https://app.tudominio.com/api/whatsapp/events/session-status
      WAHA_WEBHOOK_EVENTS: session.status
      WAHA_WEBHOOK_TOKEN_HEADER: X-Webhook-Token
      WAHA_WEBHOOK_TOKEN_VALUE: ${WAHA_WEBHOOK_TOKEN_VALUE}
      META_PIXEL_ID: ${META_PIXEL_ID}
      META_ACCESS_TOKEN: ${META_ACCESS_TOKEN}
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: https://app.tudominio.com
      LOG_LEVEL: info
    depends_on:
      postgres:
        condition: service_healthy
    networks: [backend]

  dashboard:
    build:
      context: ./dashboard
      args:
        VITE_API_BASE_URL: https://app.tudominio.com/api
    restart: always
    networks: [backend]

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [worker, dashboard]
    networks: [backend]

  alloy:
    image: grafana/alloy:latest
    restart: always
    command: run --server.http.listen-addr=0.0.0.0:12345 /etc/alloy/config.alloy
    volumes:
      - ./alloy.config:/etc/alloy/config.alloy:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock
    networks: [backend]

volumes:
  pg_data:
  caddy_data:
  caddy_config:

networks:
  backend:
    driver: bridge
```

### VPS2 — `~/casino-ai/Caddyfile`

```caddy
app.tudominio.com {
    encode zstd gzip

    # API → worker
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy worker:4000
    }

    # SPA estático
    handle {
        reverse_proxy dashboard:80
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://app.tudominio.com"
    }
}
```

---

## Fase 5 — Variables de entorno

En **cada VPS**, crear `~/casino-ai/.env` con permisos restringidos:

```bash
chmod 600 ~/casino-ai/.env
```

**Contenido VPS1:**

```env
REDIS_PASSWORD=...
VPS1_TS_IP=100.x.x.x
WEBHOOK_TOKEN_VALUE=...
WAHA_API_KEY=...
WAHA_BASIC_AUTH_HASH=$2a$...    # caddy hash-password
```

**Contenido VPS2:**

```env
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
VPS1_TS_IP=100.x.x.x
WAHA_WEBHOOK_TOKEN_VALUE=...
WAHA_API_KEY=...
META_PIXEL_ID=...
META_ACCESS_TOKEN=...
JWT_SECRET=...
```

---

## Fase 6 — Grafana Cloud vía Alloy

Un único agente Alloy por VPS shipea métricas (scrape a `/metrics`) y logs (tail de Docker stdout) a Grafana Cloud.

### `alloy.config` (ajustar targets y labels por VPS)

```alloy
// === MÉTRICAS: scrape a los servicios con /metrics ===
prometheus.scrape "services" {
  // VPS1: targets = [{"__address__" = "gateway:3000", "job" = "gateway"}]
  // VPS2: targets = [{"__address__" = "worker:4000", "job" = "worker"}]
  targets = [
    {"__address__" = "worker:4000", "job" = "worker"},
  ]
  forward_to = [prometheus.remote_write.grafana.receiver]
  metrics_path = "/metrics"
  scrape_interval = "30s"
}

prometheus.remote_write "grafana" {
  endpoint {
    url = "https://prometheus-prod-XX.grafana.net/api/prom/push"
    basic_auth {
      username = "GRAFANA_PROM_USER"
      password = "GRAFANA_PROM_TOKEN"
    }
  }
  external_labels = {
    vps = "vps2",
  }
}

// === LOGS: stdout de containers → Loki ===
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.docker.containers.targets
  forward_to = [loki.write.grafana.receiver]
}

loki.write "grafana" {
  endpoint {
    url = "https://logs-prod-XX.grafana.net/loki/api/v1/push"
    basic_auth {
      username = "GRAFANA_LOKI_USER"
      password = "GRAFANA_LOKI_TOKEN"
    }
  }
  external_labels = {
    vps = "vps2",
  }
}
```

Reemplazar `GRAFANA_*` con los valores de la cuenta Grafana Cloud.

---

## Fase 7 — Backup diario a Cloudflare R2

### `/home/deploy/casino-ai/backup.sh` (solo VPS2)

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="/tmp/casino_ai_${TIMESTAMP}.sql.gz"

docker compose -f /home/deploy/casino-ai/docker-compose.yml exec -T postgres \
  pg_dump -U casino_ai casino_ai | gzip > "$BACKUP_FILE"

rclone copy "$BACKUP_FILE" r2:casino-ai-backups/ --s3-no-check-bucket

# Retención: borrar locales > 3 días, remotos > 30 días
find /tmp -name 'casino_ai_*.sql.gz' -mtime +3 -delete
rclone delete r2:casino-ai-backups/ --min-age 30d

logger -t casino-backup "backup_completed file=$BACKUP_FILE"
```

### Instalar rclone + configurar R2

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config   # crear remote "r2" tipo s3, provider Cloudflare, endpoint https://<accountid>.r2.cloudflarestorage.com
chmod 600 ~/.config/rclone/rclone.conf
chmod +x /home/deploy/casino-ai/backup.sh
```

### Crontab (usuario `deploy`)

```cron
0 5 * * * /home/deploy/casino-ai/backup.sh >> /var/log/casino-backup.log 2>&1
```

Probar backup + restore antes de dar por listo:

```bash
# Bajar dump de R2
rclone copy r2:casino-ai-backups/casino_ai_TIMESTAMP.sql.gz /tmp/
# Restaurar en DB vacía de prueba
gunzip -c /tmp/casino_ai_TIMESTAMP.sql.gz | psql -U casino_ai -d casino_ai_test
```

---

## Fase 8 — Despliegue inicial

En **ambos VPS** como `deploy`:

```bash
git clone git@github.com:tu-org/casino-ai.git
cd casino-ai
# copiar .env (generado en Fase 5)
docker compose build
docker compose up -d
docker compose logs -f
```

**Orden recomendado**: primero VPS2 (Postgres + migraciones + Worker), luego VPS1 (Redis + Gateway + WAHA).

### Verificar migraciones de Prisma

```bash
docker compose logs worker | grep -i migration
```

Las migraciones corren automáticamente al iniciar el container (`npx prisma migrate deploy` en el CMD).

### Crear primer usuario admin

```bash
docker compose exec worker sh
# dentro del container, correr script de seed o crear directamente
```

---

## Fase 9 — Checklist de seguridad MVP

| Ítem | Fase |
|---|---|
| SSH solo por llave, root deshabilitado | 1 |
| UFW: solo 22/80/443 públicos | 1 |
| fail2ban habilitado | 1 |
| Unattended security upgrades | 1 |
| Postgres bound a `127.0.0.1` | 4 |
| Redis con password + bound a Tailscale | 4 |
| Secrets en `.env` con `chmod 600` | 5 |
| `.env` en `.gitignore` | Verificar |
| Caddy con HTTPS automático (Let's Encrypt) | 4 |
| HSTS + security headers | 4 |
| CSP en dashboard | 4 |
| WAHA detrás de basic auth + API key | 4 |
| Webhook token en cada llamada WAHA→Gateway | 4 |
| CORS whitelist estricto | 4 |
| JWT_SECRET >= 64 bytes aleatorios | 0 |
| Logs con redact de headers sensibles | Implementado |
| Containers corren como non-root (`USER node`) | 3 |
| Backups encriptados en tránsito (TLS); bucket R2 privado | 7 |
| Restore de backup probado | 7 |
| Credenciales R2 con permiso solo al bucket | 0 |

**Pendientes para post-MVP:**
- Encriptación simétrica de backups antes de subir (age/gpg)
- Scanning de imágenes Docker (Trivy en CI)
- WAF (Cloudflare proxy delante de Caddy)
- Secrets manager (Infisical/Doppler) en vez de `.env`
- Replica read-only de Postgres

---

## Fase 10 — Smoke tests post-deploy

```bash
# 1. HTTPS responde
curl -I https://api.tudominio.com/health
curl -I https://app.tudominio.com/

# 2. Gateway rechaza sin token
curl -X POST https://api.tudominio.com/webhook \
  -d '{}' -H 'Content-Type: application/json'
# esperado: 401

# 3. Gateway acepta con token
curl -X POST https://api.tudominio.com/webhook \
  -H "X-Webhook-Token: $WEBHOOK_TOKEN_VALUE" \
  -H 'Content-Type: application/json' \
  -d '{"event":"message","session":"default","payload":{"from":"5491100000000@c.us","body":"test CODE123"}}'
# esperado: 202

# 4. Worker procesa el evento
docker compose logs worker | grep lead

# 5. /metrics expone datos
docker compose exec worker wget -qO- localhost:4000/metrics | head

# 6. Dashboard carga y login funciona (verificar manualmente en browser)

# 7. Crear sesión WhatsApp en WAHA → ver webhook session.status en Gateway logs

# 8. Verificar en Grafana Cloud: métricas y logs visibles en Explore

# 9. Probar backup manual + restore a DB local

# 10. Reboot de un VPS: todos los containers deben volver solos (restart: always)
```

---

## Cronograma sugerido

| Día | Tareas |
|---|---|
| 1 | Fase 0 (prerrequisitos) + Fase 1 (hardening ambos VPS) |
| 2 | Fase 2 (Tailscale) + Fase 3 (Dockerfiles en el repo, PR, merge) |
| 3 | Fase 4 + 5 (compose + envs) + Fase 6 (Alloy) |
| 4 | Fase 7 (backup + restore probado) + Fase 8 (deploy real) |
| 5 | Fase 9 (auditar checklist) + Fase 10 (smoke tests) + dashboards en Grafana Cloud |

---

## Runbook de operación

| Operación | Comando |
|---|---|
| Ver logs en vivo | `docker compose logs -f <service>` |
| Rollback | `git checkout <tag>` → `docker compose up -d --build` |
| Restore DB | `gunzip -c dump.sql.gz \| docker compose exec -T postgres psql -U casino_ai casino_ai` |
| Rotar secrets | Editar `.env` → `docker compose up -d` |
| Backlog de Redis alto | Revisar métrica `bullmq_jobs_total{status="failed"}` y logs del worker |
