# Matriz de cumplimiento

Trazabilidad de requisitos → implementación → pruebas. Se actualiza al cerrar cada fase
(regla 6 de [CLAUDE.md](../CLAUDE.md)).

Estados: ✅ cumplido · 🟡 parcial / base lista · ⏳ pendiente (fase indicada).

## Requisitos funcionales

| Req.  | Descripción                             | Estado         | Cómo se cumple                                                                       | Dónde (código / prueba)                                        |
| ----- | --------------------------------------- | -------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| RF-01 | Catálogo público                        | ⏳ Fase 1      | —                                                                                    | —                                                              |
| RF-02 | Difusión (SEO, leads, UTM)              | ⏳ Fases 1 y 7 | —                                                                                    | —                                                              |
| RF-03 | Compra en línea                         | 🟡 Fase 4      | Puerto `PaymentGateway` + mock con reglas de Webpay                                  | `apps/api/src/integrations/payment-gateway/` · `mock.test.ts`  |
| RF-04 | Inscripción liberada y cupones          | ⏳ Fases 3 y 5 | Perfiles institucionales definidos                                                   | `packages/shared/src/domain/roles.ts`                          |
| RF-05 | Matrícula automática en el Aula Virtual | 🟡 Fase 5      | Puerto `LmsGateway` + mock; colas BullMQ con reintentos exponenciales                | `apps/api/src/integrations/lms/` · `apps/api/src/jobs/`        |
| RF-06 | Certificación verificable               | 🟡 Fase 6      | Puerto `CertificateValidator` + mock                                                 | `apps/api/src/integrations/certificate-validator/`             |
| RF-07 | Administración de la oferta             | 🟡 Fase 2      | Ruta `/admin` con carga diferida                                                     | `apps/web/src/routes.tsx` · `tests/e2e/smoke.spec.ts`          |
| RF-08 | Ventas y documentos                     | 🟡 Fase 7      | Puerto `InvoicingGateway` + mock                                                     | `apps/api/src/integrations/invoicing/`                         |
| RF-09 | Reportes                                | ⏳ Fase 7      | —                                                                                    | —                                                              |
| RF-10 | Identidad y roles                       | 🟡 Fase 2      | Puertos `IdentityProvider` (OIDC + PKCE) y `SgaGateway` + mocks; roles de plataforma | `apps/api/src/integrations/identity/`, `sga/` · `mock.test.ts` |
| RF-11 | Información al consumidor               | ⏳ Fase 3      | —                                                                                    | —                                                              |
| RF-12 | Auditoría                               | 🟡 Fase 2      | Contrato `AuditRecorder` y plugin                                                    | `apps/api/src/plugins/audit.ts`                                |

## Requisitos no funcionales

| Req.              | Descripción                                                            | Estado    | Cómo se cumple                                                                 | Dónde                                                                    |
| ----------------- | ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| RNF stack         | Node 20+, TS estricto, Fastify, Zod, OpenAPI, PostgreSQL, Redis, React | ✅        | Monorepo pnpm con el stack exigido                                             | `package.json`, `apps/*`, `tsconfig.base.json`                           |
| RNF licencias     | Sin licencias de pago recurrentes                                      | ✅        | Revisión automática de licencias de producción                                 | `scripts/check-licenses.mjs` · CI `security`                             |
| RNF despliegue    | Reproducible con docker compose                                        | 🟡 Fase 8 | Imágenes multi-etapa, compose base + dev/staging/prod, migraciones automáticas | `infra/`, `apps/*/Dockerfile`, `compose.yaml`                            |
| RNF rendimiento   | < 3 s, 300 concurrentes                                                | 🟡 Fase 8 | Code splitting público/admin, assets con hash y caché inmutable, gzip          | `infra/web/nginx.conf`                                                   |
| RNF accesibilidad | WCAG 2.1 AA                                                            | 🟡 Fase 8 | `lang="es-CL"`, skip link, foco visible, foco al cambiar de ruta, axe en E2E   | `apps/web/src/components/Layout.tsx` · `tests/e2e/accessibility.spec.ts` |
| RNF respaldo      | Respaldo diario y restauración probada                                 | ⏳ Fase 8 | —                                                                              | —                                                                        |

## Seguridad

| Req.                 | Descripción                                  | Estado         | Cómo se cumple                                                      | Dónde                                                                                  |
| -------------------- | -------------------------------------------- | -------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SEG cabeceras        | HSTS, CSP, helmet                            | ✅             | helmet en la API; CSP y cabeceras en nginx de la SPA                | `apps/api/src/plugins/security.ts` · `infra/web/security-headers.conf` · `app.test.ts` |
| SEG CORS             | Orígenes restringidos                        | ✅             | `CORS_ORIGINS` / `PUBLIC_WEB_URL`                                   | `security.ts` · `app.test.ts`                                                          |
| SEG rate limit       | Por IP (y por usuario en rutas sensibles)    | 🟡             | Límite global por IP con store Redis; límites por ruta en cada fase | `plugins/rate-limit.ts` · `app.test.ts`, `app.integration.test.ts`                     |
| SEG validación       | Zod en todas las entradas                    | ✅             | Validador y serializador Zod globales; errores 400 uniformes        | `app.ts`, `plugins/errors.ts`                                                          |
| SEG credenciales     | Sin secretos en el código                    | ✅             | Variables validadas con Zod; `.env.example`; gitleaks en CI         | `config/env.ts` · `env.test.ts` · CI `security`                                        |
| SEG logs             | Sin datos personales ni tokens               | ✅             | Redacción en pino y URLs sin query string                           | `config/logger.ts` · `logger.test.ts`                                                  |
| SEG errores          | Sin filtrar detalles internos                | ✅             | 500 genérico en español con `requestId`                             | `plugins/errors.ts` · `app.test.ts`                                                    |
| SEG análisis         | Análisis estático, auditoría de dependencias | ✅             | CodeQL, `pnpm audit`, gitleaks                                      | `.github/workflows/`                                                                   |
| SEG AuthZ            | Roles por endpoint, deny by default          | ⏳ Fase 2      | —                                                                   | —                                                                                      |
| SEG CSRF             | Protección en mutaciones con cookie          | ⏳ Fase 2      | —                                                                   | —                                                                                      |
| SEG datos personales | Leyes 19.628 y 21.719                        | ⏳ Fases 2 a 8 | —                                                                   | —                                                                                      |
| SEG IA               | Arquitectura preparada, sin datos personales | ✅             | Puerto `AiAssistant` deshabilitado y documentado                    | `integrations/ai-assistant/port.ts` · `docs/integraciones.md`                          |
