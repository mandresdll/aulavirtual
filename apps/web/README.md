# @plataforma/web

SPA React + TypeScript (Vite) con el sitio público, el área del comprador y el panel de
administración (`/admin`, cargado en un chunk aparte).

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
