# Plan de despliegue a producción — onlylemon

## Arquitectura objetivo

```
Internet
   │
   ├──> VPS1 (waha-vps) ── Caddy ──> WAHA + Gateway
   │                       │
   │                       └── Redis (solo red privada Tailscale)
   │
   └──> VPS2 (dashboard-vps) ── Caddy ──> Dashboard (SPA) + Worker (API)
                                │
                                └── Postgres (solo localhost)

VPS1 ↔ VPS2: Tailscale (100.x.x.x) — Worker consume Redis vía IP Tailscale
```

---

## Fase 0 — Prerrequisitos (antes de tocar los VPS)

### 0.1 Dominios

Registrar 3 subdominios (ej. `api.onlylemon.app` → VPS1, `app.onlylemon.app` → VPS2, `waha.onlylemon.app` → VPS1). Apuntar registros A a las IPs públicas.

### 0.2 Cuentas externas

- **Grafana Cloud** (free tier): obtener Prometheus remote write URL + user + API token, y Loki push URL + user + API token.
- **Tailscale**: generar **2 auth keys** (uno por VPS, reutilizable, ephemeral=false).
- **Cloudflare R2**: crear bucket `onlylemon-backup`, generar Access Key ID + Secret con permiso **solo a ese bucket**.
- **GHCR**: PAT con scope `read:packages` para que cada VPS pueda hacer `docker login ghcr.io`.

### 0.3 Generación de secrets (local)

Ejecutar todo en una terminal local y guardar el output en un password manager con el nombre del tenant:

```bash
# Tokens y claves aleatorias
echo "JWT_SECRET=$(openssl rand -hex 64)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 64)"
echo "WEBHOOK_TOKEN_VALUE=$(openssl rand -hex 32)"
echo "WAHA_WEBHOOK_TOKEN_VALUE=$(openssl rand -hex 32)"
echo "WAHA_API_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
echo "REDIS_PASSWORD=$(openssl rand -hex 32)"

# Basic auth hash para Caddy (WAHA dashboard)
docker run --rm caddy:2-alpine caddy hash-password --plaintext '<elegir-password>'
# → copiar el hash $2a$... como WAHA_BASIC_AUTH_HASH

# SSH key del operador (la usás para entrar al VPS)
ssh-keygen -t ed25519 -f ~/.ssh/<tenant>_ops -C "<tenant> ops"

# SSH key dedicada para CI (GitHub Actions deploy)
ssh-keygen -t ed25519 -f ~/.ssh/<tenant>_ci -N "" -C "<tenant> ci"

# Activar la key del operador en el agente local para no pasarla con -i cada vez
ssh-add ~/.ssh/<tenant>_ops
```

---

## Fase 1 — Hardening + SSH (ambos VPS)

Ejecutar como root recién provisionado:

```bash
# 1. Actualizar
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades curl git

# 2. Crear usuario no-root con sudo
adduser deploy
usermod -aG sudo deploy
```

### SSH por llave — orden estricto

El orden importa: si hacés `chown` antes de tener el `authorized_keys`, vas a tener que repetir el `chown` después.

```bash
# 3.1 Crear .ssh y authorized_keys CON el contenido de tu clave pública
mkdir -p /home/deploy/.ssh
cat > /home/deploy/.ssh/authorized_keys <<'EOF'
ssh-ed25519 AAAA... <tenant> ops
EOF

# 3.2 Ownership y permisos del home + .ssh (en este orden)
chown deploy:deploy /home/deploy
chmod 755 /home/deploy
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 3.3 Deshabilitar login root + password auth
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Probar acceso con `ssh deploy@<vps-ip>` desde tu máquina **antes** de cerrar la sesión root.

### Firewall + protección adicional

```bash
# 4. UFW — solo 22, 80, 443 públicos (Tailscale es interface separada, no se filtra)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# 5. fail2ban para SSH
systemctl enable --now fail2ban

# 6. Auto-updates de seguridad
dpkg-reconfigure -plow unattended-upgrades
```

---

## Fase 2 — Instalar Docker (ambos VPS)

```bash
# Como root o con sudo
curl -fsSL https://get.docker.com | sh

# Permitir a deploy correr docker sin sudo
usermod -aG docker deploy

# Verificar (cerrar sesión y volver como deploy primero, para que tome el grupo)
docker --version
docker compose version
```

Si después de `usermod` `docker ps` falla con permission denied, salí y volvé a entrar — el grupo se aplica en la próxima sesión.

---

## Fase 3 — Clonar el repo (ambos VPS, como `deploy`)

Necesitás que el VPS pueda autenticarse con GitHub para clonar el repo (privado).

```bash
# Como deploy
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "<vps-name> deploy"
cat ~/.ssh/github_deploy.pub
# → copiar y agregar como Deploy Key del repo en GitHub
#   Settings → Deploy keys → Add deploy key (read-only es suficiente)

cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

# Clonar
git clone git@github.com:GonzaPiccinini/onlylemon.git ~/onlylemon
cd ~/onlylemon
```

> Para forks por tenant, clonar `git@github.com:GonzaPiccinini/onlylemon-<slug>.git` en vez del upstream.

Tener el repo presente ya deja disponibles `infra/`, los compose files y `backup.sh` para las siguientes fases.

---

## Fase 4 — Red privada entre VPS con Tailscale

En **ambos VPS**:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-xxx --ssh=false --hostname=waha-vps   # o dashboard-vps
tailscale ip -4   # anotar IPs: 100.x.x.x
```

Anotar:

- `WAHA_VPS_TS_IP` (donde corre Redis)
- `DASHBOARD_VPS_TS_IP` (donde corre Worker)

UFW no bloquea `tailscale0`; Redis escuchará **solo** en esa interfaz.

---

## Fase 5 — Archivos de infraestructura (ya en el repo)

Todo lo que antes era "copiar este YAML al VPS" vive versionado:

```
docker-compose.dashboard-vps.yml   ← compose VPS2
docker-compose.waha-vps.yml        ← compose VPS1
gateway/Dockerfile
worker/Dockerfile
dashboard/Dockerfile
infra/dashboard-vps/{Caddyfile, alloy.config, backup.sh, RUNBOOK.md}
infra/waha-vps/{Caddyfile, alloy.config}
```

**No editar estos archivos por tenant.** Todo lo que cambia por cliente vive en el `.env` del VPS (Fase 6):

- Imágenes: `IMAGE_PREFIX`, `IMAGE_TAG`
- Dominios: los Caddyfiles interpolan `{$DASHBOARD_DOMAIN}`, `{$API_DOMAIN}`, `{$WAHA_DOMAIN}` desde el env
- Observabilidad: Alloy interpola `${GRAFANA_PROM_URL}`, credenciales y labels desde el env
- Backup: el script lee bucket y prefix de variables; ver Fase 7

---

## Fase 6 — Variables de entorno

En **cada VPS**, crear `~/onlylemon/.env` con permisos restringidos:

```bash
chmod 600 ~/onlylemon/.env
```

### VPS1 — `waha-vps` (compose: `docker-compose.waha-vps.yml`)

```env
# Imagen
IMAGE_PREFIX=ghcr.io/gonzapiccinini/onlylemon
IMAGE_TAG=v1.0.0

# Dominios (interpolados por el Caddyfile)
API_DOMAIN=api.onlylemon.app
WAHA_DOMAIN=waha.onlylemon.app

# Redis
REDIS_PASSWORD=...
WAHA_VPS_TS_IP=100.x.x.x

# Gateway
WEBHOOK_TOKEN_HEADER=X-Webhook-Token
WEBHOOK_TOKEN_VALUE=...
BULLMQ_QUEUE_NAME=inbound
CORS_ALLOWED_ORIGINS=https://app.onlylemon.app
LOG_LEVEL=info

# WAHA
WAHA_API_KEY=...
WAHA_BASE_URL=https://waha.onlylemon.app
WAHA_DASHBOARD_ENABLED=true
WAHA_DASHBOARD_USERNAME=admin
WAHA_DASHBOARD_PASSWORD=...
WHATSAPP_SWAGGER_ENABLED=false
WHATSAPP_SWAGGER_USERNAME=admin
WHATSAPP_SWAGGER_PASSWORD=...
WHATSAPP_DEFAULT_ENGINE=GOWS
WAHA_NAMESPACE=onlylemon
WAHA_LOG_FORMAT=JSON
WAHA_LOG_LEVEL=info
WAHA_PRINT_QR=false

# WAHA media storage (auto-conversion OCR) — comprobantes guardados en R2
# El worker borra el objeto cuando la conversión se crea exitosamente.
WAHA_MEDIA_STORAGE=S3
WAHA_S3_BUCKET=onlylemon-receipts
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_REGION=auto
WHATSAPP_FILES_MIMETYPES=image/jpeg,image/png,application/pdf
WHATSAPP_FILES_LIFETIME=7200

# Grafana Cloud
GRAFANA_PROM_URL=https://prometheus-prod-XX.grafana.net/api/prom/push
GRAFANA_PROM_USER=...
GRAFANA_PROM_TOKEN=...
GRAFANA_LOKI_URL=https://logs-prod-XX.grafana.net/loki/api/v1/push
GRAFANA_LOKI_USER=...
GRAFANA_LOKI_TOKEN=...
```

### VPS2 — `dashboard-vps` (compose: `docker-compose.dashboard-vps.yml`)

```env
# Imagen
IMAGE_PREFIX=ghcr.io/gonzapiccinini/onlylemon
IMAGE_TAG=v1.0.0

# Dominios
DASHBOARD_DOMAIN=app.onlylemon.app

# Postgres
POSTGRES_PASSWORD=...

# Redis (en el otro VPS, vía Tailscale)
REDIS_PASSWORD=...
WAHA_VPS_TS_IP=100.x.x.x

# Worker
BULLMQ_QUEUE_NAME=inbound
WORKER_CONCURRENCY=5
LEADS_CODE_TTL_HOURS=48
JWT_SECRET=...
JWT_REFRESH_SECRET=...
CORS_ORIGIN=https://app.onlylemon.app
LOG_LEVEL=info
# Meta CAPI: false en prod (true silencia el envío y rompe la atribución).
META_DRY_RUN=false

# Auto-conversion OCR (worker)
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
AUTO_OCR_DAILY_LIMIT=100
# Cloudflare R2 — el worker borra los recibos post-conversión.
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_REGION=auto

# WAHA (consumido por el worker)
WAHA_API_KEY=...
WAHA_BASE_URL=https://waha.onlylemon.app
WAHA_WEBHOOK_URL=http://gateway:3000/api/webhook   # interna: WAHA y gateway están en la misma red docker de VPS1
WAHA_WEBHOOK_EVENTS=session.status
WAHA_WEBHOOK_TOKEN_HEADER=X-Webhook-Token
WAHA_WEBHOOK_TOKEN_VALUE=...

# Dashboard SPA (build arg)
VITE_API_BASE_URL=https://app.onlylemon.app/api

# Grafana Cloud (mismas credenciales que VPS1, label distinto en alloy.config)
GRAFANA_PROM_URL=https://prometheus-prod-XX.grafana.net/api/prom/push
GRAFANA_PROM_USER=...
GRAFANA_PROM_TOKEN=...
GRAFANA_LOKI_URL=https://logs-prod-XX.grafana.net/loki/api/v1/push
GRAFANA_LOKI_USER=...
GRAFANA_LOKI_TOKEN=...
```

> **Sobre `WAHA_WEBHOOK_URL`**: el worker (en dashboard-vps) le pasa esta URL a WAHA cuando crea una sesión. WAHA (en waha-vps) la guarda y la usa para POSTear eventos. Como WAHA y gateway corren en la misma red docker de VPS1, `http://gateway:3000/api/webhook` resuelve por DNS interno. No usar la URL pública: agrega latencia, pasa por Caddy y rompe si la cuenta de Caddy tiene problemas.

---

## Fase 7 — Backup diario a Cloudflare R2

El script vive versionado en [`infra/dashboard-vps/backup.sh`](../infra/dashboard-vps/backup.sh). Hace:

- Dump de Postgres con `pg_dump` dentro del container, comprimido con gzip.
- Sube a Cloudflare R2 con `rclone copy` al bucket `onlylemon-backup` (prefix configurable por tenant).
- Limpia backups locales > 3 días y remotos > 30 días.
- Loguea cada paso con timestamp ISO-8601 UTC a stdout (capturado por cron en `/var/log/onlylemon-backup.log`).

Cualquier cambio (retención, bucket, prefix) → editar el script en el repo y mergear, **no editar la copia del VPS** (el workflow hace `git reset --hard`).

### 7.1 Setup en el VPS (dashboard-vps, como `deploy`)

```bash
# 1. Instalar rclone y configurar el remote
curl https://rclone.org/install.sh | sudo bash
rclone config   # crear remote "r2" tipo s3, provider Cloudflare,
                # endpoint https://<accountid>.r2.cloudflarestorage.com
chmod 600 ~/.config/rclone/rclone.conf

# 2. Crear el log file con ownership correcto
sudo touch /var/log/onlylemon-backup.log
sudo chown deploy:deploy /var/log/onlylemon-backup.log

# 3. Verificar que deploy puede usar docker sin sudo
groups deploy | grep -q docker && echo "ok docker group" || echo "FALTA: usermod -aG docker deploy"

# 4. Instalar el cron
crontab -e
# agregar:
# 0 8 * * * /home/deploy/onlylemon/infra/dashboard-vps/backup.sh >> /var/log/onlylemon-backup.log 2>&1
```

> **Importante**: hacer todo como `deploy` (el mismo usuario que va a correr el cron). Si configurás rclone como root, el cron de `deploy` no encuentra el remote.

> El cron se interpreta en la TZ del sistema. Si el VPS está en UTC, `0 8 * * *` = 05:00 ART. Si está en `America/Argentina/Buenos_Aires`, usar `0 5 * * *`. Verificar con `timedatectl`.

### 7.2 Verificar que el cron va a ejecutarse

```bash
# (a) La entrada está registrada
crontab -l | grep backup.sh

# (b) rclone tiene el remote r2 para deploy (no para root)
rclone listremotes | grep -q '^r2:' && echo "ok rclone" || echo "FALTA configurar rclone como deploy"
```

### 7.3 Simular el entorno del cron (pre-flight)

El entorno del cron es minimalista (sin tu `$PATH` interactivo). Para emularlo:

```bash
env -i HOME=/home/deploy PATH=/usr/bin:/bin /home/deploy/onlylemon/infra/dashboard-vps/backup.sh
```

Si pasa acá, el cron real pasa. Si falla pero corre con `bash backup.sh`, el problema es alguna variable de entorno.

### 7.4 Logs del cron

```bash
# Daemon de cron (confirma que disparó)
sudo journalctl -u cron --since today | grep backup.sh

# Output del script
tail -f /var/log/onlylemon-backup.log

# Confirmar que el dump llegó a R2
rclone ls r2:onlylemon-backup/ | tail
```

Diagnóstico:

- Sin entradas en journald a la hora pactada → cron nunca disparó (sintaxis mal, daemon caído, o crontab del usuario equivocado).
- En journald pero log vacío → arrancó pero no pudo escribir el log (permisos), o murió antes del primer `echo`.
- Ambos pero falla → error en `/var/log/onlylemon-backup.log`.

### 7.5 Forzar una ejecución de prueba

Editar temporalmente el crontab para disparar en 2 minutos (ej. son las 14:30):

```cron
32 14 * * * /home/deploy/onlylemon/infra/dashboard-vps/backup.sh >> /var/log/onlylemon-backup.log 2>&1
```

Mirar `tail -f /var/log/onlylemon-backup.log` y `rclone ls r2:onlylemon-backup/`. Después restaurar la entrada original.

### 7.6 Probar restore antes de dar por listo

```bash
rclone copy r2:onlylemon-backup/onlylemon_TIMESTAMP.sql.gz /tmp/
gunzip -c /tmp/onlylemon_TIMESTAMP.sql.gz | psql -U onlylemon -d onlylemon_test
```

---

## Fase 8 — Despliegue inicial

En **ambos VPS** como `deploy`, parado en `~/onlylemon`:

```bash
# Loguear en GHCR (PAT con scope read:packages)
echo "<GHCR_PAT>" | docker login ghcr.io -u GonzaPiccinini --password-stdin

# Bootstrap inicial
docker compose -f docker-compose.<vps>.yml pull
docker compose -f docker-compose.<vps>.yml up -d
docker compose -f docker-compose.<vps>.yml logs -f
```

> Reemplazar `<vps>` por `dashboard-vps` o `waha-vps` según corresponda.
> Si por alguna razón no querés depender de GHCR para el bootstrap: `docker compose -f docker-compose.<vps>.yml build` y después `up -d`. Para deploys subsiguientes, el pipeline CI/CD se encarga (Fase 11).

**Orden recomendado**: primero VPS2 (Postgres + migraciones + Worker), después VPS1 (Redis + Gateway + WAHA).

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
| Postgres bound a `127.0.0.1` | 5 |
| Redis con password + bound a Tailscale | 5 |
| Secrets en `.env` con `chmod 600` | 6 |
| `.env` en `.gitignore` | Verificar |
| Caddy con HTTPS automático (Let's Encrypt) | 5 |
| HSTS + security headers | 5 |
| CSP en dashboard | 5 |
| WAHA detrás de basic auth + API key | 5/6 |
| Webhook token en cada llamada WAHA→Gateway | 6 |
| CORS whitelist estricto | 6 |
| JWT_SECRET >= 64 bytes aleatorios | 0 |
| Logs con redact de headers sensibles | Implementado |
| Containers corren como non-root (`USER node`) | 5 |
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
curl -I https://api.onlylemon.app/health
curl -I https://app.onlylemon.app/

# 2. Gateway rechaza sin token
curl -X POST https://api.onlylemon.app/api/webhook \
  -d '{}' -H 'Content-Type: application/json'
# esperado: 401

# 3. Gateway acepta con token
curl -X POST https://api.onlylemon.app/api/webhook \
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

## Fase 11 — Handoff a CI/CD (GitHub Actions)

Después del bootstrap manual de Fase 8, todos los deploys subsiguientes los maneja el pipeline en `.github/workflows/`:

- **`ci.yml`** — push a `main` o PR: lint/typecheck/test/build de los 3 servicios.
- **`release.yml`** — buildea y pushea las 3 imágenes a `ghcr.io/gonzapiccinini/onlylemon-{worker,gateway,dashboard}`. Dispara con:
  - **push a `main`** → tags `:sha-<git-sha>` + `:latest`. Si `AUTO_DEPLOY=true`, hace SSH a cada VPS y deploya.
  - **push de tag `v*`** (ej. `v1.0.0`) → tag inmutable `:v1.0.0`. **No deploya** — los releases versionados son pull-based.
- **`rollback.yml`** — `workflow_dispatch` manual. Recibe VPS + image tag.

### Cortar un release versionado

```bash
git tag v1.0.0
git push origin v1.0.0
# → workflow buildea ghcr.io/gonzapiccinini/onlylemon-{worker,gateway,dashboard}:v1.0.0
```

Forks/clientes fijan ese tag en su `.env` (`IMAGE_TAG=v1.0.0`) y deciden cuándo absorben el siguiente release haciendo `docker compose pull && up -d`.

### Setup del pipeline (una vez)

1. **La SSH key de CI** ya la generaste en Fase 0.3 (`~/.ssh/<tenant>_ci`). Instalar la pública en `/home/deploy/.ssh/authorized_keys` de **ambos VPS**, manteniendo la del operador. Cada tenant tiene su propia key de CI — nunca reutilizar entre tenants.

2. **Secrets en GitHub** (Settings → Secrets and variables → Actions → **Secrets**):

   | Secret | Valor |
   |---|---|
   | `DASHBOARD_VPS_HOST` | IP pública dashboard-vps |
   | `DASHBOARD_VPS_USER` | `deploy` |
   | `DASHBOARD_VPS_SSH_KEY` | Contenido de `~/.ssh/<tenant>_ci` (privada) |
   | `WAHA_VPS_HOST` | IP pública waha-vps |
   | `WAHA_VPS_USER` | `deploy` |
   | `WAHA_VPS_SSH_KEY` | Contenido de `~/.ssh/<tenant>_ci` (privada) |

3. **Variables en GitHub** (Settings → Secrets and variables → Actions → **Variables**):

   | Variable | Valor | Notas |
   |---|---|---|
   | `VITE_API_BASE_URL` | `https://app.<dominio>/api` | Se hornea en el SPA en build-time. |
   | `AUTO_DEPLOY` | `false` | Cambiar a `true` después del primer deploy manual exitoso. |

4. **Workflow permissions** (Settings → Actions → General): Read and write permissions.

5. **Snapshot de rollback**: en cada VPS, antes del primer deploy automático, taggear las imágenes en uso como `rollback-pre-cicd`:

   ```bash
   for svc in worker dashboard; do  # gateway en waha-vps
     IMG=$(docker inspect $(docker compose -f docker-compose.<vps>.yml ps -q $svc) --format='{{.Image}}')
     docker tag "$IMG" "ghcr.io/gonzapiccinini/onlylemon-$svc:rollback-pre-cicd"
   done
   ```

6. **Habilitar deploys** (Settings → Variables → Actions): cambiar `AUTO_DEPLOY` a `true`.

7. **Branch protection** (recomendado): Settings → Branches → require status check `CI passed` antes de mergear a `main`.

A partir de ese punto, cada PR mergeado a `main` dispara CI → build → deploy automático.

---

## Cronograma sugerido

| Día | Tareas |
|---|---|
| 1 | Fase 0 (prerrequisitos) + Fase 1 (hardening ambos VPS) + Fase 2 (Docker) |
| 2 | Fase 3 (clonar repo) + Fase 4 (Tailscale) + Fase 5 (revisar archivos de infra) |
| 3 | Fase 6 (envs) + Fase 7 (backup + restore probado) |
| 4 | Fase 8 (deploy real) |
| 5 | Fase 9 (auditar checklist) + Fase 10 (smoke tests) + Fase 11 (CI/CD) + dashboards en Grafana Cloud |

---

## Runbook de operación

| Operación | Comando |
|---|---|
| Deploy a producción | Mergear PR a `main` → `release.yml` corre solo. Manual: Actions → Release → Run workflow → branch `main`. |
| Pausar deploys automáticos | Settings → Variables → Actions: cambiar `AUTO_DEPLOY` a `false`. |
| Rollback | Actions → Rollback → Run workflow → elegir VPS + image tag (un SHA previo o `rollback-pre-cicd`). |
| Ver logs en vivo | `docker compose -f docker-compose.<vps>.yml logs -f <service>` |
| Restore DB | `gunzip -c dump.sql.gz \| docker compose -f docker-compose.dashboard-vps.yml exec -T postgres psql -U onlylemon onlylemon` |
| Rotar secrets | Editar `.env` del VPS afectado → `docker compose -f docker-compose.<vps>.yml up -d` |
| Backlog de Redis alto | Revisar métrica `bullmq_jobs_total{status="failed"}` y logs del worker |
