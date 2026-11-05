#!/bin/sh
# Genera un respaldo de la base y borra los que superan la retención.
# Conexión: PGHOST, PGUSER, PGPASSWORD y PGDATABASE. Opcional: BACKUP_DIR,
# BACKUP_RETENTION_DAYS y BACKUP_PASSPHRASE (cifra con AES-256).
set -eu

umask 077
dir="${BACKUP_DIR:-/backups}"
retention="${BACKUP_RETENTION_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dir/plataforma-$stamp.dump"
partial="$dir/.partial-$stamp"

trap 'rm -f "$partial"' EXIT

mkdir -p "$dir"
pg_dump --format=custom --no-owner --file="$partial"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  file="$file.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$partial" -out "$file"
  rm -f "$partial"
else
  mv "$partial" "$file"
fi

find "$dir" -maxdepth 1 -name 'plataforma-*' -type f -mtime "+$retention" -delete
echo "Respaldo listo: $file ($(du -h "$file" | cut -f1))"
