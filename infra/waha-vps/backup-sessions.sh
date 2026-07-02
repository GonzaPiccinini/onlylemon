#!/usr/bin/env bash
# Backup diario de las sesiones de WhatsApp (WAHA) a Cloudflare R2
# Crontab: 0 12 * * * /home/deploy/onlylemon/infra/waha-vps/backup-sessions.sh >> /var/log/onlylemon-backup-sessions.log 2>&1
# El crontab marca 0 12 porque hay 6 hs. de diferencia con ARG.
#
# El volumen waha_data contiene una base SQLite (sesiones de WhatsApp), que no
# se puede copiar "en caliente" sin riesgo de corrupción. Por eso el servicio
# waha se detiene antes de armar el archivo y se reinicia apenas termina el
# tar (downtime de unos segundos). El trap garantiza el reinicio de waha
# incluso si el tar o el upload a R2 fallan.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
set -euo pipefail

# Evitar dos corridas superpuestas del mismo script
LOCK_FILE="/tmp/onlylemon-backup-sessions.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] backup_skipped reason=already_running"
  exit 0
fi

COMPOSE_FILE="/home/deploy/onlylemon/docker-compose.waha-vps.yml"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR="/home/deploy/onlylemon/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILENAME="onlylemonwahasessions${TIMESTAMP}.tar.gz"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILENAME}"
R2_BUCKET="onlylemon-backup"
R2_PREFIX="sessions"
RETENTION_LOCAL_DAYS=3
RETENTION_REMOTE_DAYS=30

WAHA_STOPPED=0
restart_waha() {
  if [ "$WAHA_STOPPED" -eq 1 ]; then
    docker compose -f "$COMPOSE_FILE" start waha
    WAHA_STOPPED=0
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] waha_restarted"
  fi
}
trap restart_waha EXIT

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] backup_started"

docker compose -f "$COMPOSE_FILE" stop waha
WAHA_STOPPED=1

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] waha_stopped"

# El contenedor ya está detenido (Exited), por eso hace falta "-a" para que
# "docker compose ps" lo siga listando y podamos resolver su ID.
WAHA_CONTAINER_ID="$(docker compose -f "$COMPOSE_FILE" ps -a -q waha)"

docker run --rm \
  --volumes-from "$WAHA_CONTAINER_ID" \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/${BACKUP_FILENAME}" -C /app/.sessions .

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] archive_created file=$BACKUP_FILE size=$(du -sh "$BACKUP_FILE" | cut -f1)"

# Si waha ya está corriendo en este punto, algo externo lo levantó durante el
# tar (p. ej. un deploy con `docker compose up -d`) y el archivo puede estar
# corrupto: descartarlo y fallar de forma visible en vez de subir un backup roto.
if [ -n "$(docker compose -f "$COMPOSE_FILE" ps -q waha)" ]; then
  WAHA_STOPPED=0
  rm -f "$BACKUP_FILE"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] backup_aborted reason=waha_restarted_externally file_discarded=$BACKUP_FILENAME"
  exit 1
fi

# El tar ya está listo: reiniciamos waha antes de subir a R2 para que el
# downtime sea de segundos y no dependa de la velocidad del upload.
restart_waha
trap - EXIT

rclone copy "$BACKUP_FILE" "r2:${R2_BUCKET}/${R2_PREFIX}/" --s3-no-check-bucket

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] upload_completed bucket=$R2_BUCKET prefix=$R2_PREFIX"

# Limpiar backups locales viejos
find "$BACKUP_DIR" -name 'onlylemonwahasessions*.tar.gz' -mtime +"$RETENTION_LOCAL_DAYS" -delete

# Limpiar backups remotos viejos
rclone delete "r2:${R2_BUCKET}/${R2_PREFIX}/" --min-age "${RETENTION_REMOTE_DAYS}d" --s3-no-check-bucket

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] backup_completed"
