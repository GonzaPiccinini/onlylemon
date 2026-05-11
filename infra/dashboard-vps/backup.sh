#!/usr/bin/env bash
# Backup diario de Postgres a Cloudflare R2
# Crontab: 0 11 * * * /home/deploy/onlylemon/infra/dashboard-vps/backup.sh >> /var/log/onlylemon-backup.log 2>&1
# El crontab marca 0 11 porque hay 6 hs. de diferencia con ARG.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
set -euo pipefail

COMPOSE_FILE="/home/deploy/onlylemon/docker-compose.dashboard-vps.yml"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_DIR="/home/deploy/onlylemon/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="${BACKUP_DIR}/onlylemonbackup${TIMESTAMP}.sql.gz"
R2_BUCKET="onlylemon-backup"
RETENTION_LOCAL_DAYS=3
RETENTION_REMOTE_DAYS=30

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] backup_started"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U onlylemon onlylemon | gzip > "$BACKUP_FILE"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] dump_created file=$BACKUP_FILE size=$(du -sh "$BACKUP_FILE" | cut -f1)"

rclone copy "$BACKUP_FILE" "r2:${R2_BUCKET}/" --s3-no-check-bucket

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] upload_completed bucket=$R2_BUCKET"

# Limpiar backups locales viejos
find "$BACKUP_DIR" -name 'onlylemon*.sql.gz' -mtime +"$RETENTION_LOCAL_DAYS" -delete

# Limpiar backups remotos viejos
rclone delete "r2:${R2_BUCKET}/" --min-age "${RETENTION_REMOTE_DAYS}d" --s3-no-check-bucket

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] backup_completed"