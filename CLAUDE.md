# CLAUDE.md — Plataforma de Cursos UTA · CFT Estatal de Magallanes

Plataforma de difusión, venta e inscripción de cursos de la UTA del CFT Estatal de Magallanes (organismo público, Chile). Se integra con el Aula Virtual (Moodle), la pasarela de pagos del CFT, el SGA (identidad, roles, validador de certificados) y el sistema de boletas/facturas. **No** reemplaza al Aula Virtual ni al módulo de aranceles del SGA.

Especificación completa: [PROMPT_CLAUDE_CODE.md](PROMPT_CLAUDE_CODE.md). Se trabaja **una fase por sesión** (sección 10), con PR al cierre de cada una.

## Reglas permanentes

1. **Stack obligatorio** (ver abajo). No introducir componentes con licencias de pago recurrentes ni servicios SaaS de pago. Todo open source.
2. **No inventar APIs externas.** El SGA, el proveedor de identidad, el validador de certificados y el sistema de boletas/facturas tienen contratos desconocidos. Cada integración se implementa como **puerto (interfaz) + adaptador real configurable + adaptador mock** para desarrollo y pruebas. Documentar en `docs/integraciones.md` los supuestos hechos y lo que falta confirmar (preguntas abiertas Q1–Q10 de la especificación).
3. **Sin credenciales en el código.** Todo por variables de entorno validadas con Zod al arranque. Mantener `.env.example` con todas las variables y comentarios.
4. **Cada funcionalidad con pruebas.** Unitarias para la lógica de dominio, de integración para la API (con base de datos real en contenedor) y E2E para los flujos críticos.
5. **Trabajo por ramas y PR**: una rama por fase o módulo (`feat/catalogo`, `feat/pagos`…), commits pequeños con Conventional Commits. El código se entrega mediante pull requests revisados por la contraparte.
6. **Trazabilidad**: cada módulo indica en su README qué requisitos cumple (RF-xx, RNF, SEG). Mantener `docs/matriz-cumplimiento.md` actualizada.
7. **Idioma**: interfaz, textos legales, documentación y mensajes de error de usuario en **español de Chile**. Código, nombres de variables y commits en **inglés**.
8. **Dinero en enteros (CLP, sin decimales)**. Fechas en UTC en BD, mostradas en `America/Punta_Arenas`.
9. **Operaciones de pago idempotentes** y con máquina de estados explícita. Nunca confiar en el retorno del navegador: confirmar siempre contra la pasarela desde el servidor.
10. **Datos personales mínimos** (Ley 21.719): solo recolectar lo necesario, con finalidad declarada. Nunca enviar datos personales a servicios de IA de terceros.
11. **Antes de cerrar cada fase**: `typecheck`, `lint`, `test` y `build` en verde, y documentación actualizada.

## Stack (resumen de la sección 3)

- **API**: Node.js 20+, TypeScript estricto, Fastify, Zod (`fastify-type-provider-zod`), OpenAPI 3 en `/api/docs`.
- **Datos**: PostgreSQL 16+, Prisma, migraciones versionadas. Redis para caché, rate limit y colas BullMQ.
- **Web**: SPA React + TypeScript con Vite, React Router, TanStack Query, React Hook Form + Zod, Radix UI + Tailwind, tokens de identidad gráfica configurables.
- **Otros**: `pdf-lib`/`pdfmake` + `qrcode`, `nodemailer` (SMTP), pino para logs (sin datos personales ni tokens).
- **Infra**: Docker + docker compose (staging y production separados), GitHub Actions.
- **Pruebas**: Vitest, `fastify.inject`/Supertest, Playwright + axe-core, k6.
- **Monorepo** pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`, `infra/`, `docs/`, `tests/e2e`, `tests/load`.

## Comandos y convenciones del repo

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`: lo que exige la regla 11. `pnpm test:integration` necesita `docker compose up -d postgres redis`; `pnpm test:e2e` usa `vite preview` o `E2E_BASE_URL`.
- Variables nuevas: agregarlas a `apps/api/src/config/env.ts` **y** a `.env.example` (una prueba falla si falta alguna).
- Integraciones: `apps/api/src/integrations/<sistema>/{port,mock,<real>}.ts` + `<sistema>.contract.ts`; elegir el adaptador en `integrations/index.ts`.
- Errores al cliente: lanzar `AppError` (mensaje en español); el plugin de errores da el formato `{ error: { code, message, details?, requestId } }`.
- Esquemas que usa la SPA van en `packages/shared`; la API y la SPA importan `@plataforma/shared`.
- Migraciones: `pnpm --filter @plataforma/api db:migrate` (nunca editar una migración ya aplicada).

## Restricciones de dominio que no se negocian

- Unicidad de inscripción por usuario + edición; control de cupos transaccional.
- Sin borrado físico de órdenes, pagos ni auditoría. `AuditLog` append-only.
- Nunca pasan datos de tarjeta por la plataforma (flujo de redirección de la pasarela).
- Control de acceso por roles en cada endpoint (deny by default).
