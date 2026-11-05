# Respaldo diario de PostgreSQL: pg_dump con cron, retención y cifrado opcional.
FROM postgres:16-alpine

RUN apk add --no-cache openssl

COPY --chmod=755 backup.sh restore.sh check-restore.sh entrypoint.sh /usr/local/bin/

ENTRYPOINT ["entrypoint.sh"]
