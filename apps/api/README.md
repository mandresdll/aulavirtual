# @plataforma/api

API REST (Fastify + Zod + Prisma) y worker de trabajos asíncronos (BullMQ).

## Requisitos que cubre (Fase 7)

- **RF-02 Difusión** (`src/modules/diffusion/`):
  - `POST /api/leads`: interesado con consentimiento explícito; el texto y la versión los guarda el
    servidor. Límite `LEADS_RATE_LIMIT_MAX`.
  - Baja en un clic `POST /api/leads/unsubscribe/{token}` (RFC 8058): alcanza a todo el correo.
  - Novedades: borrador en el panel y envío por tandas (cola `diffusion`, `send-campaigns`).
  - UTM de la visita al interesado y a la orden; una orden sin UTM hereda la del interesado.
  - `POST /api/courses/{slug}/views`: contador diario sin cookies, IP ni usuario.
- **RF-08 Ventas y documentos** (`src/modules/sales/`, cola `sales`):
  - Listado con filtros y descarga en CSV o XLSX (`src/lib/tabular.ts`).
  - Conciliación diaria (`reconcile-payments`, 06:00 de Punta Arenas): solo marca diferencias.
  - Documentos: `submit-documents` envía al sistema de emisión; con `INVOICING_DRIVER=export` salen
    en el archivo contable y el folio se registra en el panel.
- **RF-09 Reportes** (`src/modules/reports/`): ingresos, inscritos, aprobación, certificados y
  conversión por UTM, por curso, edición o mes, con descarga.

## Requisitos que cubre (Fase 6)

- **RF-06 Certificación verificable** (`src/modules/certificates/`, `jobs/processors/certificates.ts`):
  - `rules.ts`: resultado del curso (por finalización o nota) y código `XXXX-XXXX-XXXX`.
  - `certificate-pdf.ts`: PDF determinista con QR; se guarda su SHA-256 y se regenera al descargar.
  - Cola `certificates`: `sync-results` cada hora; `send-certificates` y `sync-validator` cada
    minuto.
  - Verificación pública `GET /api/verify/{code}` con límite `VERIFY_RATE_LIMIT_MAX`: solo nombre,
    curso, horas y fecha.
  - Reemisión con código nuevo enlazado al anterior y revocación con motivo, ambas auditadas.
  - Adaptador HTTP del validador (`integrations/certificate-validator/sga.ts`) sobre un contrato
    supuesto (Q5).

## Requisitos que cubre (Fase 5)

- **RF-05 Matrícula** (`src/modules/enrollment/`, `jobs/processors/enrollment.ts`):
  - Adaptador Moodle Web Services (`integrations/lms/moodle.ts`).
  - Cola `enrollment`: `sweep-enrollments` encola `enroll-user` con reintentos exponenciales.
  - `send-welcomes`, `sync-withdrawals` y `advance-waitlists` corren cada minuto.
- **RF-04 Inscripción liberada**: `POST /api/enrollments/free`, con perfiles desde el SGA y el
  mismo control de cupos.
- **Lista de espera** (`waitlist.service.ts`): cupo retenido `WAITLIST_OFFER_HOURS`.

## Requisitos que cubre (Fase 4)

- **RF-03 Pago** (`src/modules/payments/`):
  - `PaymentsService`: inicio del pago, retorno de la pasarela, confirmación en el servidor y
    recuperación de confirmaciones interrumpidas.
  - `state-machine.ts`: transiciones permitidas de órdenes y pagos.
  - `ReceiptsService`: comprobante PDF (`pdf-lib`) y correo con reintentos.
  - `RefundsService`: devoluciones totales y parciales por la pasarela, idempotentes.
  - Adaptador Webpay Plus (`integrations/payment-gateway/webpay.ts`). Con
    `PAYMENT_GATEWAY_DRIVER=mock`, `/api/dev/mock-payment` permite aprobar, rechazar o anular.
- **Worker** (cola `checkout`, cada minuto): `expire-orders`, `recover-payments` y
  `send-receipts`.

## Requisitos que cubre (Fase 3)

- **RF-03 Compra en línea (sin el pago)** (`src/modules/checkout/`):
  - Carrito en la BD para usuarios con sesión. El de visitantes vive en su navegador y se
    describe con `/cart/preview`.
  - Cotización con cupón y confirmación de la compra (orden `awaiting_payment`).
  - Precios congelados en CLP enteros, número `UTA-AAAA-NNNNNN` (secuencia), historial de
    estados y documento tributario (boleta, o factura con RUT validado).
  - Idempotencia con la cabecera `Idempotency-Key`.
- **Control de cupos transaccional**:
  - Al confirmar se bloquean las filas de las ediciones (`FOR UPDATE`) y se cuentan las
    inscripciones y reservas vigentes.
  - Las reservas duran `SEAT_RESERVATION_TTL_MINUTES`. El worker (cola `checkout`) anula cada
    minuto las órdenes vencidas y devuelve los cupos y el uso del cupón.
- **RF-04 Cupones** (`checkout/pricing.ts`, `admin/coupons.service.ts`):
  - Tipos porcentaje y monto fijo, con alcance, vigencia y límites totales y por usuario.
  - Un cupón del 100 % genera una orden pagada de $0 con inscripciones `pending_lms`, que la
    matrícula de la Fase 5 lleva al Aula Virtual.
  - Los cupones los administran `uta_admin` y `uta_finance`.
- **RF-11 Información al consumidor** (`src/modules/legal/`):
  - Textos legales versionados e inmutables (trigger).
  - Versión vigente por tipo según su fecha de vigencia.
  - Datos del proveedor (`SELLER_*`).
  - El checkout exige la versión vigente de los cuatro textos y guarda versiones, hash, IP y
    fecha en la orden.

## Requisitos que cubre (Fase 2)

- **RF-10 Identidad y roles** (`src/modules/auth/`):
  - SSO con el IdP institucional: OIDC Authorization Code + PKCE S256 con `openid-client`
    (`integrations/identity/oidc.ts`). En desarrollo se usa un IdP simulado con página de
    selección de usuario (`/api/dev/mock-idp/authorize`).
  - Sesión en Redis. El navegador solo guarda una cookie `__Host-sid` (`HttpOnly`, `Secure`,
    `SameSite=Lax`) con un id aleatorio de 256 bits. Se renueva el id en cada inicio de sesión,
    la sesión vence por inactividad y tiene duración máxima. El `state`, el `nonce` y el
    verificador PKCE viven en una transacción de un solo uso, ligada al navegador por la cookie
    `__Host-login`.
  - Roles y perfiles desde `SgaGateway.getUserRoles` (`integrations/sga/http.ts`), con caché en
    Redis (`SGA_ROLES_CACHE_TTL_SECONDS`) que se refresca en cada inicio de sesión. Si el SGA no
    responde, se niega el acceso.
  - Al ingresar se crea o actualiza el usuario con datos mínimos: id del IdP, id del SGA,
    nombre y correo.
- **SEG AuthZ** (`modules/auth/access.plugin.ts`):
  - Cada ruta bajo `/api` declara `config.access`: `public`, `authenticated` o
    `{ permission }`. Si una ruta no lo declara, la API no arranca (deny by default).
  - Los permisos (`PERMISSIONS` en shared) se otorgan por rol.
- **SEG CSRF**: las mutaciones con sesión exigen la cabecera `x-csrf-token`, comparada en
  tiempo constante con el token de la sesión, y rechazan un `Origin` que no sea el de la SPA.
- **SEG rate limit**: el login tiene su propio límite por IP (`AUTH_RATE_LIMIT_MAX`).
- **RF-07 (parcial) Panel de administración** (`src/modules/admin/`):
  - CRUD de áreas, docentes, cursos y ediciones.
  - Publicar y despublicar cursos y ediciones. Archivar cursos (no se borran).
  - Duplicar ediciones como borrador. Eliminar una edición solo si es un borrador sin uso.
  - Cada cambio invalida la caché pública del catálogo (fichas afectadas, listados,
    destacados, áreas y sitemap).
- **RF-12 Auditoría** (`plugins/audit.ts`, `modules/admin/audit-log.service.ts`):
  - `PrismaAuditRecorder` escribe en `audit_logs` (append-only por trigger) dentro de la
    misma transacción que el cambio.
  - Registra actor, rol, acción, entidad, antes y después (solo los campos que cambiaron), IP,
    user agent y `requestId`.
  - Se auditan los inicios y cierres de sesión y todas las acciones del panel.
  - Vista de solo lectura con filtros por fecha local, usuario, acción y entidad.

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
- **RF-03, RF-05, RF-10**: puertos de integración con adaptadores simulados.
- **RF-12**: contrato de auditoría (persistido desde la Fase 2).

## Estructura

```
src/
  app.ts            construcción de la app (inyección de dependencias, usada por las pruebas)
  server.ts         proceso HTTP
  worker.ts         proceso de colas BullMQ
  config/           variables de entorno (Zod) y logger
  plugins/          errores, seguridad, rate limit, OpenAPI, auditoría
  modules/          módulos de dominio: health, catalog, seo, auth (sesión, roles, acceso), admin
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

Autenticación (acceso público salvo el cierre de sesión):

| Método | Ruta                          | Descripción                                                             |
| ------ | ----------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/auth/login?returnTo=`   | Redirige al IdP (rate limit por IP)                                     |
| GET    | `/api/auth/callback`          | Retorno del IdP: crea la sesión y redirige a `returnTo` o a `/ingresar` |
| GET    | `/api/auth/session`           | Usuario, roles, perfiles y token CSRF (`no-store`)                      |
| POST   | `/api/auth/logout`            | Cierra la sesión (CSRF); devuelve la URL de cierre en el IdP si existe  |
| GET    | `/api/dev/mock-idp/authorize` | Solo con `IDENTITY_DRIVER=mock`: elegir usuario de demostración         |

Carrito, checkout y textos legales:

| Método   | Ruta                                            | Acceso                                           |
| -------- | ----------------------------------------------- | ------------------------------------------------ |
| GET      | `/api/cart/preview?editionIds=`                 | Público (carrito del navegador)                  |
| GET      | `/api/cart`                                     | Sesión                                           |
| POST     | `/api/cart/items`                               | Sesión + CSRF                                    |
| DELETE   | `/api/cart/items/{editionId}`                   | Sesión + CSRF                                    |
| POST     | `/api/cart/merge`                               | Sesión + CSRF                                    |
| POST     | `/api/checkout/quote`                           | Sesión + CSRF (rate limit)                       |
| POST     | `/api/checkout/orders`                          | Sesión + CSRF + `Idempotency-Key`                |
| GET      | `/api/orders/{number}`                          | Sesión (solo el dueño)                           |
| GET      | `/api/legal`, `/api/legal/provider`             | Público                                          |
| GET/POST | `/api/admin/legal`                              | `legal:manage` (`uta_admin`)                     |
| GET/POST | `/api/admin/coupons`                            | `coupons:manage` (`uta_admin`, `uta_finance`)    |
| PUT      | `/api/admin/coupons/{id}`                       | `coupons:manage`                                 |
| POST     | `/api/orders/{number}/pay`                      | Sesión + CSRF (rate limit)                       |
| GET      | `/api/my/enrollments`                           | Sesión                                           |
| POST     | `/api/enrollments/free`                         | Sesión + CSRF (perfil permitido)                 |
| POST     | `/api/waitlist`                                 | Sesión + CSRF                                    |
| DELETE   | `/api/waitlist/{editionId}`                     | Sesión + CSRF                                    |
| GET      | `/api/admin/enrollments`, `/api/admin/waitlist` | `enrollments:manage` (`uta_admin`, `uta_editor`) |
| POST     | `/api/admin/enrollments/{id}/retry`             | `enrollments:manage`                             |
| GET/POST | `/api/payments/return`                          | Público (solo trae un token)                     |
| GET      | `/api/orders/{number}/receipt`                  | Sesión (solo el dueño, orden pagada)             |
| GET      | `/api/admin/orders/{number}`                    | `orders:refund` (`uta_admin`, `uta_finance`)     |
| POST     | `/api/admin/orders/{number}/refunds`            | `orders:refund` + `Idempotency-Key`              |

Panel de administración. Todas las rutas exigen sesión y permiso, y las mutaciones además el
token CSRF. `catalog:manage` corresponde a `uta_admin` y `uta_editor`; `audit:read`, solo a
`uta_admin`.

| Método     | Ruta                                                                             | Permiso                                |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| GET/POST   | `/api/admin/areas`                                                               | `catalog:manage`                       |
| PUT/DELETE | `/api/admin/areas/{id}`                                                          | `catalog:manage`                       |
| GET/POST   | `/api/admin/instructors`                                                         | `catalog:manage`                       |
| PUT/DELETE | `/api/admin/instructors/{id}`                                                    | `catalog:manage`                       |
| GET        | `/api/admin/courses` (`q`, `status`, `page`)                                     | `catalog:read` (también `uta_finance`) |
| POST       | `/api/admin/courses`                                                             | `catalog:manage`                       |
| GET        | `/api/admin/courses/{id}`                                                        | `catalog:read`                         |
| PUT        | `/api/admin/courses/{id}`                                                        | `catalog:manage`                       |
| POST       | `/api/admin/courses/{id}/publish·unpublish·archive`                              | `catalog:manage`                       |
| POST       | `/api/admin/courses/{id}/editions`                                               | `catalog:manage`                       |
| PUT/DELETE | `/api/admin/editions/{id}`                                                       | `catalog:manage`                       |
| POST       | `/api/admin/editions/{id}/publish·unpublish·duplicate`                           | `catalog:manage`                       |
| GET        | `/api/admin/sales`, `/api/admin/sales/export`                                    | `sales:manage`                         |
| GET        | `/api/admin/documents`                                                           | `sales:manage`                         |
| POST       | `/api/admin/documents/export`, `/api/admin/documents/{id}/folio·retry`           | `sales:manage`                         |
| GET·POST   | `/api/admin/reconciliation`                                                      | `sales:manage`                         |
| POST       | `/api/admin/reconciliation/{id}/resolve`                                         | `sales:manage`                         |
| GET        | `/api/admin/reports`, `/api/admin/reports/export`                                | `reports:read`                         |
| GET        | `/api/admin/leads`                                                               | `diffusion:manage`                     |
| GET·POST   | `/api/admin/campaigns`                                                           | `diffusion:manage`                     |
| POST       | `/api/admin/campaigns/{id}/send`                                                 | `diffusion:manage`                     |
| POST       | `/api/leads`, `/api/leads/unsubscribe/{token}`, `/api/courses/{slug}/views`      | Público                                |
| GET        | `/api/admin/certificates` (`q`)                                                  | `certificates:manage`                  |
| POST       | `/api/admin/certificates/{id}/reissue·revoke`                                    | `certificates:manage`                  |
| GET        | `/api/admin/enrollments/review`                                                  | `certificates:manage`                  |
| POST       | `/api/admin/enrollments/{id}/result`                                             | `certificates:manage`                  |
| POST       | `/api/admin/editions/{id}/sync-results`                                          | `certificates:manage`                  |
| GET        | `/api/verify/{code}`                                                             | Público                                |
| GET        | `/api/my/courses`, `/api/my/certificates/{code}/pdf`                             | Sesión iniciada                        |
| GET        | `/api/admin/audit` (`from`, `to`, `actorId`, `action`, `entityType`, `entityId`) | `audit:read`                           |

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
