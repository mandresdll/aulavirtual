# Plataforma de Cursos UTA · CFT Estatal de Magallanes

Plataforma web de difusión, venta e inscripción de cursos de la Unidad de Tecnologías para el
Aprendizaje (UTA) del CFT Estatal de Magallanes y la Antártica Chilena.

Publica el catálogo, vende cursos con la pasarela del CFT, inscribe gratis a la comunidad
institucional y automatiza todo el ciclo: pago → matrícula en el Aula Virtual (Moodle) →
correo de acceso → certificado verificable → registro de la venta para boleta/factura.
Se integra con el SGA (identidad, roles, validador de certificados); no reemplaza al Aula
Virtual ni al módulo de aranceles del SGA.

> Estado: **Fase 3 — Carrito, cupones y checkout**. Ver el plan por fases en
> [PROMPT_CLAUDE_CODE.md](PROMPT_CLAUDE_CODE.md) (sección 10) y el avance en
> [docs/matriz-cumplimiento.md](docs/matriz-cumplimiento.md).

## Requisitos

- Node.js 20.19+ (recomendado 22 LTS, ver `.nvmrc`)
- pnpm 10 (`corepack enable` o `npm i -g pnpm@10`)
- Docker con Docker Compose v2.24+

## Arranque local (menos de 10 minutos)

```bash
cp .env.example .env
pnpm install
docker compose up --build
```

| Servicio                | URL                            |
| ----------------------- | ------------------------------ |
| Sitio (SPA + API)       | http://localhost:8080          |
| Documentación de la API | http://localhost:8080/api/docs |
| API directa             | http://localhost:3000          |
| Correos de prueba       | http://localhost:8025          |

`docker compose up` aplica las migraciones y carga los **datos de demostración** (2 áreas,
4 cursos, ediciones con y sin cupos, el cupón `BIENVENIDA10` y usuarios de prueba por rol).
La carga es idempotente y nunca se ejecuta con `APP_ENV=production`.

**Panel de administración**: http://localhost:8080/admin. En desarrollo el ingreso usa un
proveedor de identidad simulado: elige un usuario de demostración. «Administración UTA» ve
todo, incluida la auditoría; «Editora UTA» gestiona cursos, ediciones, áreas y docentes;
«Estudiante de Prueba» no tiene acceso al panel; «Finanzas UTA» gestiona cupones.

**Compra de prueba**: agrega una edición al carrito desde la ficha de un curso y confirma en
`/checkout`. El cupón `BIENVENIDA10` descuenta 10 %; `BECA-UTA-100` deja la inscripción en $0
sin pasar por la pasarela (el pago en línea llega en la Fase 4).

Todas las integraciones externas usan **adaptadores simulados** por defecto (`*_DRIVER=mock`):
no se necesita pasarela, Moodle ni SGA para desarrollar. Ver
[docs/integraciones.md](docs/integraciones.md).

### Desarrollo con recarga en caliente

Levanta solo la infraestructura en Docker y corre API, worker y web en tu máquina:

```bash
docker compose up -d postgres redis mailpit
pnpm --filter @plataforma/api db:deploy
pnpm --filter @plataforma/api db:seed   # datos de demostración (opcional)
pnpm dev
```

La SPA queda en http://localhost:5173 (Vite redirige `/api` a la API en el puerto 3000).

## Comandos

| Comando                 | Qué hace                                                |
| ----------------------- | ------------------------------------------------------- |
| `pnpm dev`              | API, SPA y `shared` en modo desarrollo                  |
| `pnpm typecheck`        | TypeScript estricto en todos los paquetes               |
| `pnpm lint`             | ESLint + Prettier                                       |
| `pnpm format`           | Formatea con Prettier                                   |
| `pnpm test`             | Pruebas unitarias (no requieren Docker)                 |
| `pnpm test:integration` | Pruebas de integración con PostgreSQL y Redis reales    |
| `pnpm test:e2e`         | E2E + accesibilidad (Playwright + axe)                  |
| `pnpm build`            | Compila `shared`, API y SPA                             |
| `pnpm licenses:check`   | Verifica que las dependencias usen licencias permitidas |

Pruebas de integración: requieren `docker compose up -d postgres redis` y las variables
`TEST_DATABASE_URL` y `TEST_REDIS_URL` (incluidas en `.env.example`):

```bash
pnpm test:integration
```

E2E contra el stack completo (por defecto se prueba la SPA sola con `vite preview`):

```bash
E2E_BASE_URL=http://localhost:8080 pnpm test:e2e
```

## Estructura

```
apps/api         API Fastify + Prisma, worker BullMQ, puertos de integración
apps/web         SPA React (sitio público, comprador y panel admin)
packages/shared  Esquemas Zod, tipos y utilidades compartidas (CLP, RUT, fechas, roles)
infra/           docker compose (dev/staging/prod), nginx de la SPA, ejemplo de proxy
docs/            Arquitectura, integraciones, matriz de cumplimiento
tests/e2e        Playwright + axe
```

## Convenciones

Las reglas permanentes del proyecto están en [CLAUDE.md](CLAUDE.md): stack, puertos y
adaptadores para integraciones, configuración por entorno, pruebas, ramas y Conventional
Commits, idioma, dinero en CLP enteros y fechas en UTC.
