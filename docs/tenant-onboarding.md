# Onboarding de un cliente nuevo

> Runbook interno: pasos para crear un fork nuevo y dejarlo corriendo en producción.
>
> **Audiencia**: el operador. El cliente nunca toca este flujo ni el VPS.
>
> Este doc es un **delta** sobre [`production-deployment.md`](./production-deployment.md). Lo común a todos los clientes (hardening, Tailscale, deploy, smoke tests) vive allá; acá solo lo que cambia **por cliente**.

---

## Prerrequisitos (una vez, no por cliente)

- [ ] Tag `v1.0.0` (o el release más reciente) cortado y publicado en GHCR
- [ ] Cuentas con acceso: Hetzner/DO (VPS), Cloudflare (DNS + R2), Tailscale, Grafana Cloud, GHCR (PAT con `read:packages`)

---

## Datos del cliente — completar antes de arrancar

| Dato                     | Ejemplo                                         | Notas                                                             |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------- |
| Slug                     | `acme`                                          | minúsculas, sin espacios — se usa en repo, GHCR labels, R2 prefix |
| Dominio base             | `acme.app`                                      | TLD del cliente                                                   |
| Subdominios              | `app.acme.app`, `api.acme.app`, `waha.acme.app` | apuntan a VPS2/VPS1/VPS1 respectivamente                          |
| Versión upstream a fijar | `v1.0.0`                                        | tag inmutable en `ghcr.io/.../onlylemon-*:vX.Y.Z`                 |
| Email del super admin    | `gonza@acme.app`                                | se crea via bootstrap                                             |
| Meta Pixel ID + token    | —                                               | si el cliente lo tiene                                            |
| Branding                 | `logo.png`, `favicon.svg`, color primario       | assets reales del cliente                                         |

---

## 1. Crear el repo del cliente

Repo nuevo **privado** standalone (no fork): `onlylemon-<slug>` (ej. `onlylemon-acme`). Conserva la historia del upstream para poder `git merge upstream/main` después, pero sin el marker "forked from" — cada cliente es su propio proyecto.

```bash
# 1.1 Crear el repo vacío en GitHub
gh repo create GonzaPiccinini/onlylemon-acme --private --description "onlylemon — instance: Acme"

# 1.2 Mirror del upstream al repo nuevo (en directorio temporal)
git clone --bare git@github.com:GonzaPiccinini/onlylemon.git /tmp/onlylemon-mirror.git
cd /tmp/onlylemon-mirror.git
git push --mirror git@github.com:GonzaPiccinini/onlylemon-acme.git
cd .. && rm -rf /tmp/onlylemon-mirror.git

# 1.3 Clonar el repo del cliente para trabajar
git clone git@github.com:GonzaPiccinini/onlylemon-acme.git
cd onlylemon-acme
git remote add upstream git@github.com:GonzaPiccinini/onlylemon.git
git fetch upstream --tags
```

> El remote `upstream` se usa después para absorber releases nuevos (ver §10). Como compartimos historia (gracias al `--mirror`), `git merge upstream/main` funciona limpio.

> Bonus del `--mirror`: propaga todos los tags `v*` del upstream → el workflow de Actions del repo nuevo los detecta y **buildea automáticamente** las imágenes en `ghcr.io/gonzapiccinini/onlylemon-<slug>-*:vX.Y.Z`. Verificá en la pestaña Actions que los runs hayan completado antes de seguir.

---

## 2. Personalizar branding

Toda la rebranding vive en `dashboard/src/branding/` y `dashboard/public/`. Sin tocar nada más.

```bash
# 2.1 Constantes y nombres
edit dashboard/src/branding/constants.ts
# → BRAND_NAME, APP_TITLE
```

```bash
# 2.2 Assets (drop-in, mismo nombre)
cp ~/Downloads/cliente-logo.png            dashboard/public/logo_con_nombre.png
cp ~/Downloads/cliente-logomark.png        dashboard/public/logo_sin_nombre.png
cp ~/Downloads/cliente-favicon.svg         dashboard/public/favicon.svg
```

```bash
# 2.3 (opcional) Theme colors / paleta
edit dashboard/src/branding/tokens.css
# → :root variables (--primary, --background, etc.) y body background-image
```

```bash
# 2.4 (opcional) Título del HTML
edit dashboard/index.html
# → <title>Acme Dashboard</title>
```

Verificar local:

```bash
cd dashboard && npm install && npm run dev
# abrir http://localhost:5173/, /login, /setup
```

---

## 3. Fijar la versión upstream

Los compose files usan `${IMAGE_PREFIX:-...}` y `${IMAGE_TAG:-...}` — el yaml es genérico y compartido. Para fijar la versión del cliente, setear las dos variables en el `.env` del VPS (ver §7.2):

```env
IMAGE_PREFIX=ghcr.io/gonzapiccinini/onlylemon-<slug>
IMAGE_TAG=v1.0.0
```

Eso resuelve a las imágenes que ya quedaron publicadas en §1 vía el `--mirror`:

```
ghcr.io/gonzapiccinini/onlylemon-<slug>-worker:v1.0.0
ghcr.io/gonzapiccinini/onlylemon-<slug>-dashboard:v1.0.0
ghcr.io/gonzapiccinini/onlylemon-<slug>-gateway:v1.0.0
```

> Nunca pinear `:latest` — anula el versionado.

---

## 4. Personalizar infra (por tenant)

### 4.1 Backups → R2 prefix propio

```bash
edit infra/dashboard-vps/backup.sh
# → cambiar bucket/prefix a:
#   r2:onlylemon-backup-<slug>/
```

### 4.2 Observabilidad → label de tenant

```alloy
# infra/dashboard-vps/alloy.config y infra/waha-vps/alloy.config
external_labels = {
  vps    = "vps2",            # ya existe
  tenant = "<slug>",          # ← agregar
}
```

Sin esto no podés filtrar logs/métricas por cliente en Grafana Cloud.

---

## 5. Provisionar VPS

Seguir [`production-deployment.md`](./production-deployment.md) Fases 0-2 (prerrequisitos + hardening + Tailscale). Recordar:

- 2 VPS por cliente (uno para `waha-vps`, otro para `dashboard-vps`)
- Tailscale auth keys → uno por VPS, anotar las IPs `100.x.x.x`

---

## 6. Configurar DNS

Cloudflare → zona `<dominio>.app`:

- `app.<dominio>.app` → A → IP pública dashboard-vps
- `api.<dominio>.app` → A → IP pública waha-vps
- `waha.<dominio>.app` → A → IP pública waha-vps

Esperar propagación (~2 min) antes de seguir. Caddy va a sacar TLS de Let's Encrypt en el primer arranque.

---

## 7. Configurar secrets del fork

### 7.1 Secrets de GitHub Actions (en el fork, no en upstream)

Settings del repo del fork → Secrets and variables → Actions:

| Secret                  | Valor                 |
| ----------------------- | --------------------- |
| `DASHBOARD_VPS_HOST`    | IP pública del VPS2   |
| `DASHBOARD_VPS_USER`    | `deploy`              |
| `DASHBOARD_VPS_SSH_KEY` | SSH key privada de CI |
| `WAHA_VPS_HOST`         | IP pública del VPS1   |
| `WAHA_VPS_USER`         | `deploy`              |
| `WAHA_VPS_SSH_KEY`      | SSH key privada de CI |

> Generar SSH key dedicada (`ssh-keygen -t ed25519 -f ~/.ssh/<slug>_ci -N ""`) y agregar la pública en `/home/deploy/.ssh/authorized_keys` de ambos VPS.

### 7.2 `.env` en cada VPS

Generar localmente y subir vía SCP (ver Fase 5 de production-deployment.md). **Importante**: incluir `IMAGE_PREFIX` y `IMAGE_TAG` (ver §3):

```env
IMAGE_PREFIX=ghcr.io/gonzapiccinini/onlylemon-<slug>
IMAGE_TAG=v1.0.0
```

`AUTO_DEPLOY` repo VAR: dejar en `false` hasta que el primer deploy manual esté ok.

---

## 8. Deploy inicial

Seguir [`production-deployment.md`](./production-deployment.md) Fase 8 apuntando al fork del cliente (no al upstream):

```bash
git clone git@github.com:GonzaPiccinini/onlylemon-<slug>.git ~/onlylemon
```

Recordar:

- Orden: VPS2 (Postgres + worker) primero, después VPS1 (Redis + gateway + waha)
- Migraciones de Prisma corren solas al levantar el worker
- El super admin se crea por el bootstrap inicial del worker — verificar logs

---

## 9. Backups + observabilidad

- **Backups**: Fase 7 de production-deployment.md, pero con el bucket/prefix del cliente (que ya editaste en §4.1).
- **Grafana**: dashboards por tenant filtrando por la label `tenant=<slug>` (que ya configuraste en §4.2). Replicar dashboards existentes apuntando al filtro nuevo.

---

## 10. Cuando salga un release nuevo del upstream

Cada `vX.Y.Z` que cortes en upstream existe inicialmente solo en `ghcr.io/gonzapiccinini/onlylemon-*` (sin `-<slug>` en el medio). Para que el cliente pueda usar ese release necesitás propagar el tag al repo del cliente — eso dispara su workflow → publica `ghcr.io/gonzapiccinini/onlylemon-<slug>-*:vX.Y.Z` en su namespace.

```bash
# 10.1 En el repo del cliente local
git fetch upstream --tags
git merge upstream/main          # o cherry-pick selectivo
# Resolver conflictos (idealmente ninguno fuera de src/branding y public)
git push

# 10.2 Pushear el tag para que el CI del cliente buildee sus propias imágenes
git push origin vX.Y.Z
# (verificar en la pestaña Actions del cliente que el run termine)
```

En los VPS:

```bash
ssh deploy@<vps>
cd ~/onlylemon
git pull

# Actualizar IMAGE_TAG en .env
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=vX.Y.Z/' .env

docker compose -f docker-compose.<vps>.yml pull
docker compose -f docker-compose.<vps>.yml up -d --remove-orphans
```

Si `AUTO_DEPLOY=true` en el repo del cliente, esto lo dispara solo el push a main del cliente (con el `IMAGE_TAG` que ya tenga el `.env` del VPS).

---

## 11. Smoke tests

Correr los smoke tests de Fase 10 de production-deployment.md adaptando los hosts al dominio del cliente.

---

## 12. Checklist final pre-handoff

| Item                                                                                   | OK  |
| -------------------------------------------------------------------------------------- | --- |
| Imágenes `:v1.0.0` publicadas en `ghcr.io/gonzapiccinini/onlylemon-<slug>-*` (verificar Actions del repo del cliente) |     |
| Branding visual confirmado en `/login`, `/setup`, app shell                            |     |
| HTTPS válido en los 3 subdominios                                                      |     |
| Super admin creado y puede loguearse                                                   |     |
| Webhook WAHA → gateway → worker → DB funciona end-to-end                               |     |
| Sesión WhatsApp emparejada en WAHA                                                     |     |
| Métricas y logs visibles en Grafana Cloud con label `tenant=<slug>`                    |     |
| Primer backup en R2 verificado (test de restore en DB de prueba)                       |     |
| `AUTO_DEPLOY=true` activado en el repo del cliente (solo después del primer deploy manual exitoso) |     |
| Credenciales guardadas en password manager con slug del cliente                        |     |
