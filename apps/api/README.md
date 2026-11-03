# @plataforma/api

API REST (Fastify + Zod + Prisma) y worker de trabajos asíncronos (BullMQ).

## Requisitos que cubre (Fase 1)

- **RF-01 Catálogo público** (`src/modules/catalog/`): listado con búsqueda de texto en
  español (PostgreSQL full-text, sin distinguir tildes, por prefijo), filtros por área,
  modalidad y fecha de inicio (días de Punta Arenas), paginación, destacados, ficha con
  ediciones vigentes y **cupos en tiempo casi real** (capacidad − inscripciones vigentes −
  reservas activas, caché de 15 s). Caché Redis de listados y fichas (60 s) que nunca es
  requisito: si Redis cae se lee de la BD.
- **RF-02 Difusión (SEO)** (`src/modules/seo/`): etiquetas `<head>` por página (title, meta
  description, canonical, Open Graph, Twitter Card, JSON-LD `Course` con `CourseInstance` y
  `Offer` en CLP), `sitemap.xml` y `robots.txt` dinámicos. nginx las inserta en el HTML con SSI
  (ver `infra/web/nginx.conf`). `SEO_ALLOW_INDEXING=false` fuera de producción.
- **Modelo de dominio completo** (sección 4 de la especificación) en `prisma/schema.prisma`,
  con datos de demostración idempotentes en `src/db/demo-seed.ts`.
- **Restricciones de dominio en la BD**: inscripción única por usuario + edición; sin borrado
  físico de órdenes, ítems, pagos ni devoluciones; `audit_logs` y `order_status_changes`
  append-only (triggers, también contra `TRUNCATE`); CHECK de montos CLP no negativos,
  `total = subtotal − descuento`, fechas y porcentajes de cupones.

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

| Método | Ruta                            | Descripción                                                        |
| ------ | ------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/health`                   | Liveness                                                           |
| GET    | `/api/ready`                    | Readiness: PostgreSQL y Redis (503 si alguno falla)                |
| GET    | `/api/docs`                     | Swagger UI (`/api/docs/json` para el documento OpenAPI)            |
| GET    | `/api/catalog/courses`          | Listado: `q`, `area`, `modality`, `from`, `to`, `page`, `pageSize` |
| GET    | `/api/catalog/courses/featured` | Cursos destacados (portada)                                        |
| GET    | `/api/catalog/courses/{slug}`   | Ficha publicada con ediciones vigentes y cupos (404 si no)         |
| GET    | `/api/catalog/areas`            | Áreas con cursos publicados                                        |
| GET    | `/api/seo/head`                 | Etiquetas `<head>` de la página en `X-Original-URI` (nginx SSI)    |
| GET    | `/api/seo/sitemap.xml`          | Publicado como `/sitemap.xml`                                      |
| GET    | `/api/seo/robots.txt`           | Publicado como `/robots.txt`                                       |

## Comandos

```bash
pnpm dev               # API con recarga (lee ../../.env)
pnpm worker            # worker BullMQ
pnpm test              # pruebas unitarias
pnpm test:integration  # requiere TEST_DATABASE_URL y TEST_REDIS_URL
pnpm db:migrate        # crea una migración nueva en desarrollo
pnpm db:deploy         # aplica migraciones pendientes
pnpm db:seed           # datos de demostración (bloqueado con APP_ENV=production)
```

## Modelo de datos: lo que no está en `schema.prisma`

La migración `20261104000000_domain_model` agrega SQL propio que Prisma no expresa:

| Elemento                                    | Para qué                                                         |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Extensión `unaccent` + `immutable_unaccent` | Búsqueda sin tildes, igual en documentos y consultas             |
| Trigger `courses_search_refresh`            | Mantiene `courses.search` (tsvector `spanish`, pesos A–D)        |
| Trigger `forbid_mutation`                   | Sin borrado de órdenes/pagos/devoluciones; auditoría append-only |
| Restricciones `CHECK`                       | Montos CLP enteros no negativos, totales, fechas, cupones        |

Cupos disponibles = `capacity` − inscripciones no retiradas − reservas `active` no vencidas.
El control transaccional de cupos al reservar llega con el checkout (Fase 3).
