# @plataforma/api

API REST (Fastify + Zod + Prisma) y worker de trabajos asíncronos (BullMQ).

## Requisitos que cubre (Fase 0)

- **RNF stack**: Node, TypeScript estricto, Fastify, Zod, OpenAPI 3 en `/api/docs`, PostgreSQL
  (Prisma), Redis (rate limit, BullMQ).
- **SEG**: helmet (CSP, HSTS), CORS restringido, rate limit por IP, validación Zod, errores sin
  detalles internos, logs sin datos personales, configuración validada.
- **RF-03, RF-05, RF-06, RF-08, RF-10**: puertos de integración con adaptadores simulados.
- **RF-12**: contrato de auditoría (persistencia en la Fase 2).

## Estructura

```
src/
  app.ts            construcción de la app (inyección de dependencias, usada por las pruebas)
  server.ts         proceso HTTP
  worker.ts         proceso de colas BullMQ
  config/           variables de entorno (Zod) y logger
  plugins/          errores, seguridad, rate limit, OpenAPI, auditoría
  modules/          módulos de dominio (health; catálogo, pagos… en fases siguientes)
  integrations/     puertos + adaptadores (ver docs/integraciones.md)
  jobs/             colas y procesadores
  infra/            clientes de PostgreSQL y Redis
prisma/             esquema y migraciones versionadas
test/integration/   pruebas con PostgreSQL y Redis reales
```

## Endpoints

| Método | Ruta          | Descripción                                             |
| ------ | ------------- | ------------------------------------------------------- |
| GET    | `/api/health` | Liveness                                                |
| GET    | `/api/ready`  | Readiness: PostgreSQL y Redis (503 si alguno falla)     |
| GET    | `/api/docs`   | Swagger UI (`/api/docs/json` para el documento OpenAPI) |

## Comandos

```bash
pnpm dev               # API con recarga (lee ../../.env)
pnpm worker            # worker BullMQ
pnpm test              # pruebas unitarias
pnpm test:integration  # requiere TEST_DATABASE_URL y TEST_REDIS_URL
pnpm db:migrate        # crea una migración nueva en desarrollo
pnpm db:deploy         # aplica migraciones pendientes
```
