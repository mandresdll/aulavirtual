#!/bin/sh
# Prueba de respaldo: genera uno, lo restaura en una base limpia y compara los conteos de cada tabla.
# Termina con error si algo no coincide o si la base no tenía datos.
set -eu

target="restore_check_$(date -u +%Y%m%d%H%M%S)"
dir="$(mktemp -d)"
export BACKUP_DIR="$dir"

trap 'dropdb --if-exists "$target"; rm -rf "$dir"' EXIT

backup.sh
file="$(find "$dir" -name 'plataforma-*' -type f | head -n 1)"
restore.sh "$file" "$target"

tables="$(psql -Atc "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")"
failed=0
rows=0
for table in $tables; do
  source_count="$(psql -Atc "SELECT count(*) FROM \"$table\"")"
  restored_count="$(psql -d "$target" -Atc "SELECT count(*) FROM \"$table\"")"
  rows=$((rows + source_count))
  if [ "$source_count" != "$restored_count" ]; then
    echo "DIFERENCIA en $table: $source_count y $restored_count" >&2
    failed=1
  fi
done

if [ "$rows" -eq 0 ]; then
  echo 'La base de origen no tiene datos: la prueba no demuestra nada.' >&2
  exit 1
fi

# Las protecciones de la base deben volver con el respaldo.
if psql -d "$target" -c 'DELETE FROM audit_logs' >/dev/null 2>&1; then
  echo 'El registro de auditoría perdió su protección al restaurar.' >&2
  failed=1
fi

[ "$failed" -eq 0 ]
echo "Restauración correcta: $rows filas en $(echo "$tables" | wc -l) tablas."
