# Respaldo y restauración

El servicio `backup` corre `pg_dump` cada día y guarda los archivos en el volumen `backups`. Se activa
al incluir `infra/docker-compose.backup.yml` ([despliegue.md](despliegue.md)).

En los comandos de esta guía, `COMPOSE` significa:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml
```

## Configuración

| Variable                | Uso                                                       | Valor por defecto |
| ----------------------- | --------------------------------------------------------- | ----------------- |
| `BACKUP_SCHEDULE`       | Hora en formato cron y UTC                                | `0 6 * * *`       |
| `BACKUP_RETENTION_DAYS` | Días que se conservan en el servidor                      | `14`              |
| `BACKUP_PASSPHRASE`     | Si se define, los archivos se cifran y terminan en `.enc` | vacío             |

- **Copia externa:** un respaldo en el mismo disco no sirve si se pierde el servidor. Copia el volumen
  a otro lugar. Falta definir el destino con el CFT.
- **Clave de cifrado:** si se pierde, los respaldos no se pueden recuperar. Guárdala fuera del
  servidor.
- **Qué no incluye:** solo respalda PostgreSQL. Redis guarda sesiones, caché y colas, que se regeneran.
  Los PDF no se almacenan: se vuelven a generar.

## Respaldo manual

Hazlo siempre antes de una actualización:

```bash
COMPOSE exec backup backup.sh
```

## Comprobar un respaldo

Genera uno, lo restaura en una base temporal y compara los conteos de todas las tablas. No toca los
datos reales. Conviene hacerlo una vez al mes:

```bash
COMPOSE exec backup check-restore.sh
```

El CI hace esta misma prueba en cada PR, con y sin cifrado.

## Restaurar

`restore.sh` solo escribe en una base nueva, para no pisar datos por error.

1. Detén lo que escribe en la base:

   ```bash
   COMPOSE stop api worker
   ```

2. Revisa los respaldos disponibles:

   ```bash
   COMPOSE exec backup ls -lh /backups
   ```

3. Restaura en una base nueva:

   ```bash
   COMPOSE exec backup restore.sh /backups/plataforma-20270101T060000Z.dump plataforma_restaurada
   ```

4. Cambia `POSTGRES_DB=plataforma_restaurada` en `.env` y vuelve a levantar los servicios.
5. Revisa `/api/ready`, una orden y un certificado conocidos.
6. Conserva la base anterior hasta estar seguro.

Lo ocurrido después del respaldo se pierde. Si hubo pagos en ese período, corre la conciliación de
esos días y compara con la pasarela.
