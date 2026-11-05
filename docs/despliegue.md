# Despliegue

Guía para instalar la plataforma en el servidor del CFT. Supone Linux, Docker Compose v2 y nginx
como proxy institucional (Q9, por confirmar).

## Requisitos del servidor

- Docker Engine 24 o superior con Compose v2.
- Referencia inicial: 4 vCPU, 8 GB de RAM y 50 GB de disco. Hay que ajustarla tras repetir la prueba
  de carga en el servidor real ([rendimiento.md](rendimiento.md)).
- Salida a internet hacia la pasarela, el Aula Virtual, el SGA y el SMTP institucional.
- Un dominio y su certificado TLS.

## Instalación

1. Clona el repositorio y copia la configuración:

   ```bash
   git clone https://github.com/mandresdll/aulavirtual.git
   cd aulavirtual
   cp .env.example .env
   ```

2. Completa `.env`. Cada variable tiene su comentario. En producción revisa como mínimo:
   - `POSTGRES_PASSWORD`, con una clave larga y propia.
   - `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS` y `SESSION_COOKIE_SECURE=true`.
   - Los `*_DRIVER` con sus credenciales. `APP_ENV=production` no arranca con adaptadores simulados.
   - `SELLER_*`, `SMTP_*`, `MAIL_FROM` y `UTA_ALERT_EMAIL`.
   - `BACKUP_PASSPHRASE`, si los respaldos se van a cifrar.

3. Levanta los servicios. Las migraciones se aplican solas antes de que parta la API:

   ```bash
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml up -d --build
   ```

   Para staging, cambia `docker-compose.prod.yml` por `docker-compose.staging.yml`.

4. Comprueba que responde:

   ```bash
   curl -fsS http://127.0.0.1:8080/api/ready
   ```

5. Carga los textos legales oficiales desde el panel. Los datos de demostración nunca se cargan en
   producción.

## Proxy inverso y TLS

`infra/proxy/nginx.example.conf` es un ejemplo: termina TLS 1.2 o superior, agrega HSTS y reenvía al
puerto 8080 local. Ajusta el dominio y las rutas de los certificados.

`TRUST_PROXY` debe seguir en `true`: sin esto, los límites por IP verían a todos como una sola IP.

## Límites de consultas

El límite global es por usuario con sesión y por IP sin ella. Quienes navegan sin sesión desde la red
del CFT salen por la misma IP y comparten `RATE_LIMIT_MAX`. Si hay rechazos (429) en los campus, sube
ese valor.

## Actualización

1. Respalda la base (ver abajo).
2. Actualiza y reconstruye:

   ```bash
   git pull
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml up -d --build
   ```

3. Revisa `/api/ready` y los registros de `api` y `worker`.

## Volver a la versión anterior

1. Vuelve a la etiqueta anterior con `git checkout <etiqueta>` y repite el `up -d --build`.
2. Las migraciones no se revierten solas. Si la versión nueva cambió la base de forma incompatible,
   restaura el respaldo previo siguiendo el procedimiento de abajo.

## Respaldos

El servicio `backup` corre `pg_dump` cada día (`BACKUP_SCHEDULE`, en UTC) y conserva
`BACKUP_RETENTION_DAYS` días en el volumen `backups`.

- **Cópialos fuera del servidor.** Un respaldo en el mismo disco no sirve si se pierde el servidor.
- **Cifrado:** con `BACKUP_PASSPHRASE` los archivos terminan en `.dump.enc`. Si se pierde esa clave,
  no se pueden recuperar: guárdala fuera del servidor.
- El CI restaura un respaldo en cada PR y compara los conteos de todas las tablas.

Respaldo manual:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml exec backup backup.sh
```

### Restaurar

`restore.sh` solo escribe en una base nueva, para no pisar datos por error.

1. Detén lo que escribe en la base:

   ```bash
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml stop api worker
   ```

2. Restaura en una base nueva, indicando el archivo que quieres recuperar:

   ```bash
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml exec backup restore.sh /backups/plataforma-20270101T060000Z.dump plataforma_restaurada
   ```

3. Cambia `POSTGRES_DB=plataforma_restaurada` en `.env` y vuelve a levantar los servicios.
4. Revisa `/api/ready`, una orden y un certificado conocidos. Conserva la base anterior hasta estar
   seguro.

Comprobar un respaldo sin tocar nada:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.backup.yml exec backup check-restore.sh
```

## Registros

Los contenedores rotan sus registros con `max-size` y `max-file`. No contienen datos personales ni
tokens. Para leerlos:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs -f --tail 100 api worker
```

## Por confirmar con el CFT (Q9)

Sistema operativo, versión de Docker, proxy existente, SMTP institucional, destino de la copia externa
de respaldos y capacidad real del servidor. Los límites de memoria de los archivos compose son
provisionales.
