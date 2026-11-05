#!/bin/sh
# Restaura un respaldo en una base NUEVA. Uso: restore.sh <archivo> <base-de-destino>
# No sobrescribe nada: si la base ya tiene tablas, se detiene. Ver docs/despliegue.md.
set -eu

umask 077
file="${1:?Indica el archivo de respaldo}"
target="${2:?Indica la base de destino}"
plain="$file"
cleanup=''

trap 'if [ -n "$cleanup" ]; then rm -f "$cleanup"; fi' EXIT

case "$file" in
  *.enc)
    : "${BACKUP_PASSPHRASE:?El respaldo está cifrado: define BACKUP_PASSPHRASE}"
    plain="$(mktemp)"
    cleanup="$plain"
    openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$file" -out "$plain"
    ;;
esac

exists="$(psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$target'")"
if [ "$exists" = '1' ]; then
  tables="$(psql -d "$target" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
  if [ "$tables" != '0' ]; then
    echo "La base $target ya tiene tablas: usa una base nueva." >&2
    exit 1
  fi
else
  createdb "$target"
fi

pg_restore --no-owner --exit-on-error --dbname="$target" "$plain"
echo "Restaurado en $target"
