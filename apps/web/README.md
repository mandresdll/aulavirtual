# @plataforma/web

SPA React + TypeScript (Vite) con el sitio público, el área del comprador y el panel de
administración (`/admin`, cargado en un chunk aparte).

## Requisitos que cubre (Fase 2)

- **RF-10 Identidad**:
  - `/ingresar` (`pages/LoginPage.tsx`) lleva al IdP institucional y explica por qué falló un
    intento (cancelado, expirado, servicio no disponible…).
  - El encabezado muestra «Ingresar» o, con sesión, el nombre, el acceso al panel y
    «Cerrar sesión».
  - `lib/session.ts` lee `/api/auth/session`.
  - `lib/api.ts` (`apiSend`) envía el token CSRF en cada mutación.
- **RF-07 (parcial) Panel `/admin`**:
  - Cada página se carga en un chunk aparte (`pages/admin/`).
  - `AdminLayout` exige sesión: sin ella lleva a `/ingresar?returnTo=…`. A quien no tiene
    permisos le muestra «Acceso no autorizado», y el menú solo muestra las secciones que
    permite el rol.
  - Cursos (listado con búsqueda y estado; formulario; publicar, despublicar y archivar).
  - Ediciones: fechas en hora de Punta Arenas (`datetime-local`) que se envían en UTC; cupos;
    precio CLP; tratamiento tributario; criterio de aprobación; inscripción liberada.
    Publicar, duplicar y eliminar borradores.
  - Áreas y docentes.
  - Los formularios usan React Hook Form con los esquemas Zod de shared (mensajes en español
    con `z.config(es())`).
  - Las acciones destructivas se confirman con Radix AlertDialog.
- **RF-12**: `/admin/auditoria` es de solo lectura, con filtros en la URL, el detalle «antes y
  después» y el historial por usuario o registro. Solo la ve `uta_admin`.
- **Accesibilidad**:
  - Cada campo tiene etiqueta, ayuda y error asociados (`aria-describedby`, `aria-invalid`).
  - Los resultados se anuncian con `role="status"` y `role="alert"`, y las tablas tienen
    `caption`.
  - axe sin infracciones en `/ingresar` y en las páginas del panel (E2E).

## Requisitos que cubre (Fase 1)

- **RF-01 Catálogo público**: portada con destacados y áreas (`pages/HomePage.tsx`), listado
  `/cursos` con buscador y filtros en la URL (enlaces compartibles, botón atrás) y paginación
  (`pages/CatalogPage.tsx`), ficha `/cursos/:slug` con objetivos, contenidos, requisitos,
  certificación, docentes y ediciones con fechas, horario, precio total y cupos
  (`pages/CoursePage.tsx`). Responsive verificado en 360, 768 y 1280 px (E2E).
- **RF-02 SEO**: el `index.html` trae un bloque SSI (`seo_default` + `include`) que nginx
  reemplaza por las etiquetas de cada página; `vite dev/preview` muestra las de por defecto.
  Proxy de `/sitemap.xml` y `/robots.txt` también en Vite.
- **Accesibilidad**: formulario de búsqueda con etiquetas y error asociado (`aria-invalid`,
  `aria-describedby`), estados de cupos con texto (no solo color), resultados anunciados
  (`role="status"`), paginación con `aria-current`, ruta de navegación, imágenes con
  `width`/`height` y carga diferida. axe sin infracciones en todas las páginas del catálogo.

## Requisitos que cubre (Fase 0)

- **RNF stack**: React, Vite, React Router, TanStack Query, Tailwind; validación con los
  esquemas Zod de `@plataforma/shared`.
- **RNF accesibilidad**: `lang="es-CL"`, skip link, landmarks, foco visible, foco al contenido
  al cambiar de ruta, título por página, `prefers-reduced-motion`. Revisión axe en E2E.
- **RNF rendimiento**: code splitting del panel admin.
- **Identidad gráfica (Q8)**: tokens provisorios como variables CSS en `src/styles.css`,
  sobrescribibles desde la configuración en fases siguientes.

## Comandos

```bash
pnpm dev       # http://localhost:5173 (proxy /api → http://localhost:3000)
pnpm test      # Vitest + Testing Library
pnpm build     # typecheck + build de producción en dist/
```
