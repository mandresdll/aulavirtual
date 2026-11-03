# @plataforma/shared

Esquemas Zod, tipos y utilidades de dominio que comparten la API y la SPA.

## Requisitos que cubre

- **Regla 8 (CLP enteros)**: `ClpAmountSchema`, `formatClp`, `percentageOf` (redondeo hacia
  abajo para que un descuento no supere su porcentaje).
- **Regla 8 (fechas)**: `DISPLAY_TIME_ZONE = 'America/Punta_Arenas'`, `formatDate`,
  `formatDateTime`, `toLocalIsoDate`. En BD siempre UTC.
- **Modelo de dominio (RUT)**: `isValidRut`, `normalizeRut`, `formatRut`, `RutSchema` (dígito
  verificador módulo 11, mensaje en español).
- **RF-10**: `PLATFORM_ROLES` y `COMMUNITY_PROFILES`.
- **API**: formato único de error (`ErrorResponseSchema`) y esquemas de salud.

```bash
pnpm build   # compila a dist/ (lo consume la API en producción)
pnpm test
```
