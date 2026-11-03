# Prompt para Claude Code — Plataforma de Cursos UTA · CFT Estatal de Magallanes

> **Cómo usarlo:** guarda este archivo en la raíz del repo vacío. Abre Claude Code ahí, entra en **modo plan** y escribe:
> *"Lee PROMPT_CLAUDE_CODE.md completo. Crea CLAUDE.md con las reglas permanentes de la sección 2, propón el plan de la Fase 0 y espera mi aprobación."*
> Después avanza fase por fase (sección 10). No le pidas todo de una vez.

---

## 1. Contexto y objetivo

Vas a construir desde cero una **plataforma web de difusión, venta e inscripción de cursos** para la Unidad de Tecnologías para el Aprendizaje (UTA) del CFT Estatal de Magallanes y la Antártica Chilena (organismo público, Chile).

La plataforma debe:

- Publicar un catálogo de cursos (sitio público, SEO, accesible).
- Vender cursos a público externo con pago en línea (pasarela del CFT, sin guardar datos de tarjetas).
- Inscribir gratis a estudiantes, docentes y funcionarios del CFT validados con su cuenta institucional.
- **Automatizar sin intervención manual**: pago → matrícula en el Aula Virtual (Moodle, vía web services) → correo de acceso → certificado al aprobar → registro de la venta para emisión de boleta/factura.
- Integrarse con el **SGA** (Sistema de Gestión Académica) existente: identidad, sesiones, roles, permisos y validador de certificados.

**No** reemplaza al Aula Virtual ni al módulo de pagos del SGA (aranceles). Es un sistema independiente que se integra con ambos.

Plazo contractual: **10 días corridos**. Prioriza un sistema completo, probado y documentado por sobre funciones extra.

---

## 2. Reglas permanentes (copiar a CLAUDE.md)

1. **Stack obligatorio** (sección 3). No introducir componentes con licencias de pago recurrentes ni servicios SaaS de pago. Todo open source.
2. **No inventes APIs externas.** El SGA, el proveedor de identidad, el validador de certificados y el sistema de boletas/facturas tienen contratos desconocidos. Implementa cada integración como **puerto (interfaz) + adaptador real configurable + adaptador mock** para desarrollo y pruebas. Documenta en `docs/integraciones.md` qué supuestos hiciste y qué falta confirmar.
3. **Sin credenciales en el código.** Todo por variables de entorno validadas con Zod al arranque. Incluye `.env.example` con todas las variables y comentarios.
4. **Cada funcionalidad con pruebas.** Unitarias para la lógica de dominio, de integración para la API (con base de datos real en contenedor) y E2E para los flujos críticos.
5. **Trabajo por ramas y PR**: una rama por fase o módulo (`feat/catalogo`, `feat/pagos`…), commits pequeños con Conventional Commits. El código se entrega mediante pull requests revisados por la contraparte.
6. **Trazabilidad**: cada módulo indica en su README qué requisitos cumple (RF-xx, RNF, SEG). Mantén `docs/matriz-cumplimiento.md` actualizada.
7. **Idioma**: interfaz, textos legales, documentación y mensajes de error de usuario en **español de Chile**. Código, nombres de variables y commits en inglés.
8. **Dinero en enteros (CLP, sin decimales)**. Fechas en UTC en BD, mostradas en `America/Punta_Arenas`.
9. **Operaciones de pago idempotentes** y con máquina de estados explícita. Nunca confiar en el retorno del navegador: confirmar siempre contra la pasarela desde el servidor.
10. **Datos personales mínimos** (Ley 21.719): solo recolectar lo necesario, con finalidad declarada. Nunca enviar datos personales a servicios de IA de terceros.
11. Antes de cerrar cada fase: `typecheck`, `lint`, `test` y `build` en verde, y actualizar la documentación.

---

## 3. Stack técnico (exigido por la ficha, sección 5)

| Capa | Tecnología |
|---|---|
| Servidor | **Node.js 20+**, **TypeScript** estricto, **Fastify** |
| Validación | **Zod** en entrada y salida (`fastify-type-provider-zod`) |
| API | REST documentada con **OpenAPI 3** generada desde los esquemas (`@fastify/swagger` + Swagger UI en `/api/docs`) |
| Base de datos | **PostgreSQL 16+**, ORM **Prisma** (o Drizzle), migraciones versionadas |
| Caché / colas / rate limit | **Redis** (`@fastify/rate-limit` con store Redis, **BullMQ** para trabajos asíncronos) |
| Frontend | **SPA React + TypeScript** con **Vite**, React Router, TanStack Query, React Hook Form + Zod |
| UI | Componentes accesibles (Radix UI o similar), Tailwind CSS. Identidad gráfica del CFT/SGA mediante tokens configurables (colores, logo, tipografía) |
| PDFs | `pdf-lib` o `pdfmake` para certificados y comprobantes; `qrcode` para QR |
| Correo | `nodemailer` vía SMTP institucional, plantillas con MJML o React Email |
| Despliegue | **Docker** + **docker compose**, entornos `staging` y `production` separados, detrás del proxy inverso institucional |
| CI | **GitHub Actions**: compilación, pruebas, lint, análisis estático de seguridad |
| Pruebas | **Vitest** (unidad/integración), **Supertest** o `fastify.inject`, **Playwright** (E2E), **axe-core** (accesibilidad), **k6** (carga) |

### Estructura del monorepo (pnpm workspaces)

```
/
├── apps/
│   ├── api/                 # Fastify + Prisma
│   │   ├── src/
│   │   │   ├── modules/     # catalog, cart, checkout, payments, enrollments,
│   │   │   │                # certificates, coupons, waitlist, marketing,
│   │   │   │                # sales, reports, audit, legal, admin, auth
│   │   │   ├── integrations/
│   │   │   │   ├── payment-gateway/   # port + webpay adapter + mock
│   │   │   │   ├── lms/               # port + moodle adapter + mock
│   │   │   │   ├── identity/          # port + oidc (SGA IdP) adapter + mock
│   │   │   │   ├── sga/               # port + http adapter + mock (roles, validador)
│   │   │   │   ├── invoicing/         # port + export/http adapter + mock
│   │   │   │   └── mailer/
│   │   │   ├── jobs/        # workers BullMQ
│   │   │   ├── plugins/     # auth, rate-limit, audit, errors, security headers
│   │   │   └── config/      # env (Zod)
│   │   ├── prisma/
│   │   └── test/
│   └── web/                 # SPA React (público + comprador + admin)
├── packages/
│   └── shared/              # esquemas Zod y tipos compartidos API ↔ web
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.staging.yml
│   ├── docker-compose.prod.yml
│   ├── backup/              # pg_dump programado + script de restauración
│   └── proxy/               # ejemplo de configuración nginx para el proxy institucional
├── docs/
├── .github/workflows/
└── tests/
    ├── e2e/
    └── load/
```

---

## 4. Modelo de dominio (punto de partida)

Diseña el esquema Prisma con, al menos, estas entidades. Ajusta y justifica cambios.

- **User** — referencia a la identidad. Para comunidad CFT: `sgaUserId`, `idpSubject`. Para externos: ver pregunta abierta Q3. Campos mínimos: nombre, RUT (opcional, validado con dígito verificador), email, teléfono opcional, `moodleUserId`.
- **Course** — ficha: slug, título, resumen, objetivos, contenidos, modalidad (online/presencial/mixta), duración (horas), requisitos, área, docente(s), imagen, destacado, estado (borrador/publicado/archivado), datos SEO.
- **CourseEdition** (versión/fecha) — fechas inicio/fin, cierre de inscripciones, cupos, precio CLP, tratamiento tributario (afecto/exento, configurable), `moodleCourseId`, nota/criterio de aprobación, plantilla de certificado, estado.
- **Area**, **Instructor**.
- **Cart**, **CartItem**.
- **Order** — comprador, ítems, subtotal, descuento, total, cupón, estado (`pending`, `awaiting_payment`, `paid`, `failed`, `cancelled`, `refund_requested`, `refunded`, `partially_refunded`), aceptación legal (versión de términos + hash + IP + fecha).
- **Payment** — orden, proveedor, token/buy_order, monto, estado, código de autorización, últimos 4 dígitos (solo lo que entrega la pasarela), tipo de pago, respuesta cruda sin datos sensibles, `idempotencyKey`.
- **Refund**.
- **Enrollment** — usuario, edición, origen (`purchase`, `free_institutional`, `coupon_100`, `manual_admin`), estado (`pending_lms`, `enrolled`, `failed`, `completed`, `failed_course`, `withdrawn`), intentos de sincronización, último error.
- **SeatReservation** — reserva temporal de cupo durante el checkout (TTL, p. ej. 15 min).
- **WaitlistEntry** — posición, estado, notificado en.
- **Coupon** — código, tipo (% o monto), alcance (todos/curso/edición), vigencia, usos máximos y por usuario, motivo (beca/convenio/preventa), activo.
- **Certificate** — enrollment, código único verificable (no secuencial, p. ej. 10–12 caracteres base32 legibles), fecha de emisión, nota/estado de aprobación, hash del PDF, estado (`valid`, `revoked`, `reissued`), referencia al anterior en reemisiones, estado de sincronización con el validador del SGA.
- **SalesDocument** — registro para boleta/factura: orden, tipo (boleta/factura), datos del receptor (para factura: RUT, razón social, giro, dirección), estado de exportación/integración, folio externo.
- **Lead** (interés) — email, nombre, curso de interés, consentimiento (texto + versión + fecha), UTM, estado de baja.
- **Campaign** / envíos de novedades con token de baja.
- **LegalDocument** — tipo (términos, privacidad, retracto, devoluciones), versión, contenido, vigente desde.
- **AuditLog** — append-only: actor, rol, acción, entidad, id, antes/después (diff), IP, user agent, fecha.
- **Setting** — textos configurables, identidad gráfica, parámetros.

Restricciones clave: unicidad de inscripción por usuario+edición, control de cupos transaccional (bloqueo de fila o conteo en transacción `SERIALIZABLE`), sin borrado físico de órdenes, pagos ni auditoría.

---

## 5. Requisitos funcionales y criterios de aceptación

### RF-01 Catálogo público
- Home con destacados, listado con búsqueda de texto (Postgres full-text en español), filtros por área, modalidad y fecha, paginación.
- Ficha de curso: objetivos, contenidos, modalidad, duración, fechas, cupos disponibles (en tiempo real o con caché corta), requisitos, docente, precio, certificación, ediciones abiertas.
- **Aceptación:** responsive en 360 px, 768 px y 1280 px; carga < 3 s.

### RF-02 Difusión
- **SEO en una SPA**: el servidor (Fastify o un pequeño servicio) debe inyectar `<title>`, meta description, Open Graph, Twitter Card y **JSON-LD `Course`** en el HTML de `/cursos/:slug` antes de enviarlo (meta-injection o prerender de rutas públicas). Generar `sitemap.xml` y `robots.txt` dinámicos. URLs canónicas con slug.
- Formulario de interés con **consentimiento explícito no premarcado** para recibir comunicaciones; guarda versión del texto aceptado.
- Envío de novedades solo a quienes consintieron, con enlace de baja en un clic.
- Captura y persistencia de parámetros **UTM** a lo largo del embudo (lead → orden), para reportes de conversión por campaña.
- Generador de enlaces con UTM en el panel admin.

### RF-03 Compra en línea
- Carrito (persistente para usuario autenticado; local para anónimo, fusionado al iniciar sesión).
- Checkout: datos mínimos, opción boleta/factura (si factura, datos tributarios), aplicación de cupón, aceptación obligatoria de términos/retracto/devoluciones/privacidad.
- Pago con la pasarela del CFT. **Adaptador por defecto: Transbank Webpay Plus** (`transbank-sdk`, ambiente de integración), detrás de un puerto `PaymentGateway { createTransaction, commit, getStatus, refund }` para poder cambiar a otra pasarela (ver Q1).
- Confirmación server-side, comprobante PDF + correo al comprador.
- **Nunca** pasan datos de tarjeta por la plataforma (flujo de redirección de la pasarela).
- **Aceptación:** pago aprobado, rechazado, abandonado (timeout), doble retorno del navegador (idempotencia) y reintento; todos con pruebas.

### RF-04 Inscripción liberada y beneficios
- Usuario autenticado vía SSO institucional con rol estudiante/docente/funcionario → puede inscribirse sin pago en ediciones marcadas como "liberadas para comunidad CFT" (configurable por edición; también configurable qué perfiles acceden).
- Cupones configurables (%, monto, 100 %), con vigencia, límites y alcance. Un cupón al 100 % genera orden con total 0 sin pasar por la pasarela.

### RF-05 Matrícula automática en el Aula Virtual
- Puerto `LmsGateway`. Adaptador **Moodle Web Services** (REST, token de servicio):
  - buscar usuario: `core_user_get_users_by_field` (por email o username),
  - crear usuario: `core_user_create_users`,
  - matricular: `enrol_manual_enrol_users`,
  - consultar finalización/notas: `core_completion_get_course_completion_status` y/o `gradereport_user_get_grade_items`.
- Al confirmarse pago o inscripción gratuita → encolar trabajo BullMQ `enroll-user` con reintentos exponenciales; al éxito, correo de bienvenida con enlace y acceso.
- Fallos visibles en el panel admin con botón "reintentar" y alerta por correo a la UTA.
- Lista de espera: si se libera un cupo (devolución, retiro o aumento de cupos), notificar al siguiente con plazo para comprar.

### RF-06 Certificación verificable
- Job programado (p. ej. cada hora) + acción manual: consulta en Moodle el estado de aprobación de las inscripciones de ediciones activas/finalizadas.
- Al aprobar → generar certificado PDF (plantilla con logo, nombre, RUT opcional, curso, horas, fechas, código único, **QR** a la URL de verificación) y enviarlo por correo; disponible en "Mis cursos".
- Página pública `/verificar/:codigo` y formulario de verificación; responde válido/revocado/no existe sin exponer más datos de los necesarios.
- Puerto `CertificateValidator` para **registrar el certificado en el validador del SGA** (ver Q5).
- Reemisión (corrección de nombre) que revoca el anterior y conserva trazabilidad. Revocación con motivo.
- Casos límite: reprobación, retiro, curso sin nota, edición cerrada.

### RF-07 Administración de la oferta
Panel admin (en la misma SPA, rutas `/admin`, protegido por roles): CRUD de cursos, ediciones, áreas, docentes, precios, cupos, listas de espera, cupones, textos legales (con versionado) y configuración. Previsualización, publicar/despublicar, duplicar edición. Editor de texto enriquecido con sanitización de HTML. Todo **sin intervención técnica**.

### RF-08 Registro de ventas y documentos
- Listado de ventas con filtros, detalle con historial de estados del pago.
- **Conciliación**: job diario que consulta el estado en la pasarela de las transacciones del día y marca discrepancias.
- Devoluciones (total/parcial) vía pasarela con registro y efecto sobre la matrícula (desmatricular en Moodle si corresponde) y sobre el cupo.
- **Exportación** CSV/XLSX con el formato contable que se defina + puerto `InvoicingGateway` para integración directa con el sistema de emisión de boletas/facturas electrónicas del CFT (ver Q6). Guarda folio/estado devueltos.

### RF-09 Reportes
Ventas, ingresos (brutos, descuentos, devoluciones, netos), inscritos (pagados vs. liberados), conversión (visitas de ficha → leads → órdenes → pagos, por UTM), aprobación y certificados emitidos; por curso, edición y período. Gráficos en el panel y **descarga CSV/XLSX**.

### RF-10 Identidad y roles
- Comunidad CFT: **SSO con el proveedor de identidad institucional** ya integrado al SGA (implementar OIDC con `openid-client`, Authorization Code + PKCE; dejar el adaptador preparado para SAML si fuera el caso — ver Q2).
- Sesiones, roles y permisos **heredados del SGA vía su API** (puerto `SgaGateway.getUserRoles`), con caché corta en Redis.
- Roles de la plataforma mapeados desde el SGA: `uta_admin`, `uta_editor`, `uta_finance`, `uta_reports`, `buyer`, `community_member`.
- Compradores externos: ver Q3 (contradicción en la ficha). Implementa el puerto de forma que ambas opciones sean posibles.

### RF-11 Información al consumidor (Ley 19.496)
Términos y condiciones, política de privacidad, derecho de retracto y política de devoluciones: páginas públicas, enlazadas en el pie y en el checkout, **aceptación obligatoria y registrada** (versión, fecha, IP) antes de pagar. Precio total con impuestos visible antes de pagar. Datos del proveedor (CFT) visibles.

### RF-12 Auditoría
Plugin de auditoría que registra automáticamente: acciones de administración, cambios de precio/cupos/cupones, cambios de textos legales, operaciones de pago y devoluciones, reemisiones/revocaciones de certificados, con usuario, fecha y hora. Vista de auditoría con filtros (solo lectura). Tabla append-only (sin UPDATE/DELETE, idealmente reforzado con permisos de BD o trigger).

---

## 6. Requisitos no funcionales

- **Sin licencias recurrentes**: revisa licencias de dependencias en CI (`license-checker` con lista permitida: MIT, Apache-2.0, BSD, ISC, MPL-2.0, PostgreSQL…).
- **Despliegue reproducible** desde el repo con `docker compose` y un procedimiento documentado paso a paso en `docs/despliegue.md` (requisitos del servidor, variables, migraciones, seed, proxy inverso, certificados TLS, actualización y rollback).
- **Rendimiento**: páginas públicas < 3 s; soporte ≥ 300 usuarios concurrentes. Caché Redis para catálogo y fichas, compresión, assets con hash y cache-control largo, imágenes optimizadas (WebP, tamaños responsivos, lazy loading), code splitting por ruta (público vs. admin). Entregar script **k6** con 300 VUs y el resultado en `docs/rendimiento.md`.
- **Accesibilidad WCAG 2.1 AA**: HTML semántico, navegación por teclado, foco visible, contraste, etiquetas en formularios, mensajes de error asociados, `lang="es-CL"`, skip links. Pruebas automáticas con axe en Playwright para todas las páginas públicas y el checkout; checklist manual en `docs/accesibilidad.md`.
- **Respaldo diario** de PostgreSQL (contenedor con cron + `pg_dump`, retención configurable, cifrado opcional) y **script de restauración probado** (test que restaura un dump en una BD limpia y verifica conteos).

---

## 7. Seguridad y cumplimiento

- TLS 1.2+ (terminado en el proxy institucional; documentar configuración). HSTS, CSP estricta, `@fastify/helmet`, cookies `HttpOnly`, `Secure`, `SameSite`, protección CSRF en mutaciones con sesión por cookie.
- Rate limiting por IP y por usuario en login, checkout, formulario de interés y verificación de certificados.
- Control de acceso por roles en cada endpoint (deny by default) + pruebas de autorización.
- Validación Zod en todas las entradas; sanitización de HTML enriquecido; consultas parametrizadas (ORM).
- Webhooks/retornos de la pasarela validados contra la API de la pasarela; montos verificados contra la orden.
- **Ley 19.628 y Ley 21.719**: minimización, finalidad, consentimiento para comunicaciones, derecho de acceso/rectificación/supresión (endpoint/admin para exportar y anonimizar datos de un titular), retención definida. Documentar el inventario de datos personales en `docs/datos-personales.md`.
- Logs estructurados (pino) **sin datos personales sensibles ni tokens**.
- **IA (EX-04)**: no implementar funciones de IA en esta entrega, pero dejar la arquitectura preparada: un puerto `AiAssistant` vacío con documentación de cómo conectarlo al asistente institucional del SGA respetando controles de costo y sin enviar datos personales.

---

## 8. CI/CD y calidad

Workflow de GitHub Actions en cada PR:
1. `pnpm install --frozen-lockfile`
2. `typecheck`, `lint` (ESLint + Prettier)
3. Pruebas unitarias e integración con servicios PostgreSQL 16 y Redis
4. `build` de api y web, build de imágenes Docker
5. Análisis estático de seguridad: **CodeQL** (o Semgrep), `pnpm audit`, **gitleaks** (secretos), revisión de licencias
6. E2E Playwright + axe contra el stack levantado con compose (con adaptadores mock)

Cobertura objetivo: ≥ 80 % en módulos de dominio (pagos, cupos, cupones, inscripciones, certificados).

---

## 9. Documentación y entregables en el repo

- `README.md` — qué es, arranque local en < 10 min (`pnpm i && docker compose up && pnpm dev`), comandos.
- `docs/arquitectura.md` — diagrama (Mermaid) de componentes, flujos de compra → matrícula → certificado, máquina de estados de orden/pago/inscripción.
- `docs/integraciones.md` — cada puerto, adaptador, variables, supuestos y preguntas abiertas.
- `docs/despliegue.md`, `docs/respaldo-restauracion.md`, `docs/rendimiento.md`, `docs/accesibilidad.md`, `docs/datos-personales.md`.
- `docs/matriz-cumplimiento.md` — tabla RF-01…RF-12, RNF, compatibilidad (sección 5 de la ficha) y seguridad, con "cómo se cumple" y "dónde está" (ruta del código/prueba). Esta matriz se reutiliza en la oferta técnica.
- `docs/manual-administracion.md` — para la UTA, con capturas.
- `docs/manual-comprador.md` — para usuarios finales.
- `docs/prueba-punta-a-punta.md` — guion del curso de prueba (compra, matrícula, acceso, certificado) con evidencia.
- Seed de demostración: 2 áreas, 4 cursos, ediciones con y sin cupos, un cupón, usuarios de prueba por rol.

---

## 10. Plan de trabajo por fases (10 días corridos)

Trabaja **una fase por sesión**, con PR al cierre de cada una.

| Día | Fase | Contenido | Hito verificable |
|---|---|---|---|
| 1 | **0. Fundaciones** | Monorepo, TS estricto, Fastify, Prisma, Vite/React, Docker compose (api, web, postgres, redis, mailpit), config Zod, OpenAPI, CI base, CLAUDE.md, puertos de integración con mocks | `docker compose up` levanta todo; CI verde; `/api/docs` disponible |
| 2 | **1. Dominio y catálogo** | Esquema completo + migraciones + seed; API catálogo; páginas públicas home/listado/ficha; SEO meta-injection, sitemap, JSON-LD | RF-01 y parte de RF-02 con pruebas |
| 3 | **2. Identidad y admin base** | SSO OIDC (mock + real), roles desde SGA (mock), panel admin cursos/ediciones/áreas/docentes, auditoría | RF-07 (parcial), RF-10, RF-12 |
| 4 | **3. Carrito, cupones y checkout** | Carrito, reserva de cupos con TTL, cupones, textos legales versionados y aceptación | RF-04 (cupones), RF-11 |
| 5 | **4. Pagos** | Adaptador Webpay Plus (integración) + mock, máquina de estados, idempotencia, comprobante PDF y correo, devoluciones | RF-03 completo con pruebas de todos los escenarios |
| 6 | **5. Matrícula** | Adaptador Moodle WS + mock, jobs BullMQ con reintentos, inscripción liberada comunidad CFT, lista de espera, correos | RF-04, RF-05 |
| 7 | **6. Certificados** | Sincronización de aprobación, PDF con QR, verificación pública, validador SGA (puerto), reemisión/revocación | RF-06 |
| 8 | **7. Ventas, documentos, reportes, difusión** | Conciliación, exportación boletas/facturas + puerto, reportes con descarga, leads con consentimiento, novedades, UTM | RF-02, RF-08, RF-09 |
| 9 | **8. Calidad y no funcionales** | Accesibilidad (axe + manual), k6 300 VUs, endurecimiento de seguridad, backups + prueba de restauración, compose staging/prod, cobertura | Sección 4 y 6 de la ficha |
| 10 | **9. Documentación y entrega** | Manuales, matriz de cumplimiento, guion E2E con la UTA, revisión final, ambiente de pruebas operativo | Entregables sección 8 de la ficha |

Al final de cada fase entrega: resumen de lo hecho, requisitos cubiertos, pruebas añadidas, decisiones tomadas y bloqueos.

---

## 11. Preguntas abiertas (a resolver en la reunión de inicio con la UTA)

Mientras no haya respuesta, usa el supuesto indicado y regístralo en `docs/integraciones.md`.

| # | Pregunta | Supuesto por defecto |
|---|---|---|
| Q1 | ¿Qué pasarela tiene contratada el CFT (Webpay Plus, Flow, Mercado Pago, Getnet…)? ¿Credenciales del ambiente de integración? | Transbank Webpay Plus, ambiente de integración público |
| Q2 | ¿Qué proveedor de identidad usa el SGA (Microsoft Entra ID, Google Workspace, Keycloak…)? ¿OIDC o SAML? | OIDC estándar |
| Q3 | **Contradicción**: RF-10 pide cuentas de compradores externos, pero la sección 5 prohíbe "bases de usuarios paralelas". ¿Los externos se crean en el IdP/SGA vía API, o se admite un registro local mínimo solo para compradores? | Crear/registrar externos vía API del SGA; adaptador alternativo de cuentas locales desactivado por flag |
| Q4 | Versión de Moodle, URL, token de web services y funciones habilitadas; ¿método de matrícula manual activo? ¿criterio de aprobación (finalización vs. nota)? | Moodle 4.x, `enrol_manual`, aprobación por finalización de curso |
| Q5 | API del validador de certificados del SGA: ¿se registran los certificados ahí o el validador consulta a esta plataforma? | La plataforma expone su verificación y además publica en el validador vía puerto |
| Q6 | Sistema de emisión de boletas/facturas del CFT: ¿tiene API o solo importación de archivos? ¿formato contable? ¿cursos afectos o exentos de IVA? | Exportación CSV/XLSX configurable; tratamiento tributario configurable por edición |
| Q7 | API del SGA para sesiones, roles y permisos: documentación, autenticación servicio-a-servicio | Cliente HTTP con token de servicio, contrato definido en OpenAPI propia como mock |
| Q8 | Identidad gráfica del SGA (colores, tipografías, componentes) y logos en alta resolución | Tokens de diseño provisorios basados en el burdeo institucional del CFT |
| Q9 | Servidores del CFT: SO, versión de Docker, proxy inverso existente (nginx/traefik), SMTP institucional | Linux + Docker Compose v2 + nginx |
| Q10 | Plazo de retracto y política de devoluciones definidos por el CFT | Retracto de 10 días según art. 3 bis de la Ley 19.496, textos editables |

---

## 12. Definición de "terminado"

La entrega está completa cuando:

- [ ] Todos los RF-01 a RF-12 funcionan en el ambiente de pruebas con pasarela en modo pruebas y Aula Virtual real (o su entorno de pruebas).
- [ ] Un curso real de la UTA probado de punta a punta (compra → matrícula → acceso → certificado), documentado.
- [ ] CI verde: compilación, pruebas, lint, análisis de seguridad, licencias, secretos.
- [ ] Accesibilidad AA verificada (automática + checklist), rendimiento verificado con k6.
- [ ] Respaldo diario configurado y restauración probada.
- [ ] Documentación técnica, manuales y matriz de cumplimiento completos en el repo.
- [ ] Sin credenciales en el código ni en el historial.
