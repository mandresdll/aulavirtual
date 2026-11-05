#!/bin/sh
# Programa el respaldo con cron. Cron no hereda el entorno: se guarda en un archivo solo para root.
set -eu

umask 077
export -p | grep -E ' (PATH|PG[A-Z]+|BACKUP_[A-Z_]+)=' > /etc/backup.env

schedule="${BACKUP_SCHEDULE:-0 3 * * *}"
echo "$schedule . /etc/backup.env; /usr/local/bin/backup.sh" > /etc/crontabs/root
echo "Respaldo programado: $schedule (UTC)"

exec crond -f -l 6
