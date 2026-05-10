# Onboarding de un cliente nuevo

> Runbook interno: pasos para crear un fork nuevo y dejarlo corriendo en producción.
>
> **Audiencia**: el operador. El cliente nunca toca este flujo ni el VPS.
>
> Este doc es un **delta** sobre [`production-deployment.md`](./production-deployment.md). Lo común a todos los clientes (hardening, Tailscale, deploy, smoke tests) vive allá; acá solo lo que cambia **por cliente**.

---

## Prerrequisitos (una vez, no por cliente)

- [ ] Tag `v1.0.0` (o el release más reciente) cortado en upstream `GonzaPiccinini/onlylemon`
- [ ] Cuentas con acceso desde tu cuenta personal: Hetzner/DO (VPS), Cloudflare (DNS + R2), Tailscale, Grafana Cloud
- [ ] **Password manager con folder/tag por cliente** — vas a custodiar N cuentas GitHub, cada una con su contraseña + TOTP + recovery codes. Organizá esto bien desde el día 1
- [ ] **Inbox para emails únicos por cuenta** — Gmail permite alias con `+`: si tu mail es `tucorreo@gmail.com`, GitHub acepta `tucorreo+acme@gmail.com`, `tucorreo+betacorp@gmail.com`, etc. Todos te llegan al mismo inbox

---

## Datos del cliente — completar antes de arrancar

| Dato                     | Ejemplo                                         | Notas                                                                     |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
| Slug                     | `acme`                                          | minúsculas, sin espacios — se usa en username GH, GHCR namespace, R2 prefix |
| Cuenta GitHub            | `onlylemon-acme`                                | username de la cuenta GH a crear (típicamente `onlylemon-<slug>`)         |
| Email para GitHub        | `tucorreo+acme@gmail.com`                       | alias `+slug` sobre tu inbox real                                          |
| Dominio base             | `acme.app`                                      | TLD del cliente                                                            |
| Subdominios              | `app.acme.app`, `api.acme.app`, `waha.acme.app` | apuntan a VPS2/VPS1/VPS1 respectivamente                                  |
| Versión upstream a fijar | `v1.0.0`                                        | tag inmutable, va a vivir en `ghcr.io/onlylemon-<slug>/onlylemon-*:vX.Y.Z` |
| Email del super admin    | `gonza@acme.app`                                | se crea via bootstrap                                                      |
| Meta Pixel ID + token    | —                                               | si el cliente lo tiene                                                     |
| Branding                 | `logo.png`, `favicon.svg`, color primario       | assets reales del cliente                                                  |

---

## 1. Crear la cuenta GitHub del cliente + el repo

Cada cliente vive en su propia cuenta GitHub controlada por vos. Aísla blast radius: si una cuenta cliente se compromete, las otras quedan intactas.

### 1.1 Crear la cuenta GitHub

1. Cerrá sesión en GitHub (o usá un browser/perfil distinto).
2. Sign up con email `tucorreo+<slug>@gmail.com`.
3. Username: `onlylemon-<slug>` (ej. `onlylemon-acme`).
4. **Habilitá 2FA con TOTP** apenas verifiques email. Guardá recovery codes en el password manager.
5. Generá un PAT clásico con scopes `repo`, `read:packages`, `write:packages` desde la propia cuenta del cliente. Lo vas a usar para SSH/GHCR. Guardalo en el password manager.
6. Agregá tu SSH key personal a la cuenta para poder pushear como vos sin sign-in. Settings → SSH and GPG keys.

### 1.2 Crear el repo en la cuenta del cliente

Ahora podés volver a tu sesión normal de GitHub. Las acciones siguientes se hacen como `GonzaPiccinini` pero apuntando al namespace del cliente — vos tenés acceso porque agregaste tu SSH key arriba.

```bash
# 1.2.1 Crear el repo vacío en la cuenta del cliente
gh repo create onlylemon-acme/onlylemon --private --description "onlylemon — instance: Acme"

# 1.2.2 Mirror del upstream al repo del cliente (en directorio temporal)
git clone --bare git@github.com:GonzaPiccinini/onlylemon.git /tmp/onlylemon-mirror.git
cd /tmp/onlylemon-mirror.git
git push --mirror git@github.com:onlylemon-acme/onlylemon.git
cd .. && rm -rf /tmp/onlylemon-mirror.git

# 1.2.3 Clonar el repo del cliente para trabajar
git clone git@github.com:onlylemon-acme/onlylemon.git onlylemon-acme
cd onlylemon-acme
git remote add upstream git@github.com:GonzaPiccinini/onlylemon.git
git fetch upstream --tags
```

> El `push --mirror` propaga todos los tags `v*` del upstream → el workflow del cliente los detecta y **buildea automáticamente** las imágenes en `ghcr.io/onlylemon-<slug>/onlylemon-*:vX.Y.Z`. Es el bootstrap del GHCR del cliente. Verificá en la pestaña Actions del repo nuevo que los runs hayan completado antes de seguir.

> El remote `upstream` se usa después para absorber releases nuevos (ver §10). Como compartimos historia (gracias al `--mirror`), `git merge upstream/main` funciona limpio.

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

Los compose files usan `${IMAGE_PREFIX:-...}` y `${IMAGE_TAG:-...}` con defaults. Para el cliente, fijás ambos en el `.env` del VPS (no editás el yaml).

En el `.env` de cada VPS (ver §5 de [`production-deployment.md`](./production-deployment.md)):

```env
IMAGE_PREFIX=ghcr.io/onlylemon-acme/onlylemon
IMAGE_TAG=v1.0.0
```

Eso hace que `docker compose up -d` resuelva a:

```
ghcr.io/onlylemon-acme/onlylemon-worker:v1.0.0
ghcr.io/onlylemon-acme/onlylemon-dashboard:v1.0.0
ghcr.io/onlylemon-acme/onlylemon-gateway:v1.0.0
```

Para que el VPS pueda pullear de la GHCR privada del cliente, necesitás logearte con el PAT que generaste en §1.1.5:

```bash
echo "<PAT_DEL_CLIENTE>" | docker login ghcr.io -u onlylemon-acme --password-stdin
```

> El cliente **nunca** debería usar `:latest` ni el prefix de upstream — eso anula el versionado y rompe el aislamiento de blast radius.

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

## 7. Configurar secrets del repo del cliente

### 7.1 Secrets de GitHub Actions (en el repo del cliente, no en upstream)

`onlylemon-<slug>/onlylemon` → Settings → Secrets and variables → Actions:

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
IMAGE_PREFIX=ghcr.io/onlylemon-<slug>/onlylemon
IMAGE_TAG=v1.0.0
```

`AUTO_DEPLOY` repo VAR: dejar en `false` hasta que el primer deploy manual esté ok.

---

## 8. Deploy inicial

Seguir [`production-deployment.md`](./production-deployment.md) Fase 8 apuntando al repo del cliente (no al upstream):

```bash
git clone git@github.com:onlylemon-<slug>/onlylemon.git ~/onlylemon
```

Antes del primer `docker compose up -d`, asegurate de hacer `docker login ghcr.io -u onlylemon-<slug>` con el PAT del cliente, sino el pull falla por GHCR privado.

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

Cada `vX.Y.Z` que cortes en upstream existe inicialmente solo en `ghcr.io/gonzapiccinini/onlylemon-*`. Para que el cliente pueda usar ese release necesitás:

1. Mergear el upstream en el repo del cliente.
2. Pushear el tag al repo del cliente → eso dispara su workflow → se publica `ghcr.io/onlylemon-<slug>/onlylemon-*:vX.Y.Z` en SU GHCR.
3. Actualizar `IMAGE_TAG` en el `.env` del VPS y `docker compose pull && up -d`.

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

Si `AUTO_DEPLOY=true` en el repo del cliente, el push a main del cliente dispara el deploy automático (con el tag de `.env` del VPS).

---

## 11. Smoke tests

Correr los smoke tests de Fase 10 de production-deployment.md adaptando los hosts al dominio del cliente.

---

## 12. Checklist final pre-handoff

| Item                                                                                   | OK  |
| -------------------------------------------------------------------------------------- | --- |
| Cuenta GitHub del cliente con 2FA + recovery codes guardados                           |     |
| PAT del cliente guardado (scopes: repo, read:packages, write:packages)                 |     |
| Imágenes `:v1.0.0` publicadas en `ghcr.io/onlylemon-<slug>/onlylemon-*` (chequear Actions del repo del cliente) |     |
| Branding visual confirmado en `/login`, `/setup`, app shell                            |     |
| HTTPS válido en los 3 subdominios                                                      |     |
| Super admin creado y puede loguearse                                                   |     |
| Webhook WAHA → gateway → worker → DB funciona end-to-end                               |     |
| Sesión WhatsApp emparejada en WAHA                                                     |     |
| Métricas y logs visibles en Grafana Cloud con label `tenant=<slug>`                    |     |
| Primer backup en R2 verificado (test de restore en DB de prueba)                       |     |
| `AUTO_DEPLOY=true` activado en el repo del cliente (solo después del primer deploy manual exitoso) |     |
| Credenciales guardadas en password manager con slug del cliente                        |     |
