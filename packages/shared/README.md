# @plataforma/shared

Esquemas Zod, tipos y utilidades de dominio que comparten la API y la SPA.

## Requisitos que cubre

- **Regla 8 (CLP enteros)**: `ClpAmountSchema`, `formatClp`, `percentageOf` (redondeo hacia
  abajo para que un descuento no supere su porcentaje).
- **Regla 8 (fechas)**: `DISPLAY_TIME_ZONE = 'America/Punta_Arenas'`, `formatDate`,
  `formatDateTime`, `toLocalIsoDate`. En BD siempre UTC.
- **Modelo de dominio (RUT)**: `isValidRut`, `normalizeRut`, `formatRut`, `RutSchema` (dígito
  verificador módulo 11, mensaje en español).
- **RF-10**:
  - `PLATFORM_ROLES` y `COMMUNITY_PROFILES`.
  - `PERMISSIONS` (permiso → roles que lo otorgan; deny by default), con `hasPermission`,
    `canAccessAdmin` y `primaryRole`.
  - Esquemas de sesión (`SessionResponseSchema`, `ReturnToSchema` contra redirecciones
    abiertas) y `CSRF_HEADER`.
- **RF-07 / RF-12**: esquemas del panel (`AreaInputSchema`, `InstructorInputSchema`,
  `CourseInputSchema`, `EditionInputSchema` con reglas de fechas, nota y perfiles) y de la
  auditoría (`AuditQuerySchema`, `AuditLogEntrySchema`). Los usan los formularios de la SPA y
  la validación de la API.
- **Fechas en formularios**: `toLocalDateTimeInput` y `fromLocalDateTimeInput` convierten
  entre hora de Punta Arenas y UTC.
- **RF-01 (catálogo)**: esquemas de la API pública (`CourseListQuerySchema`,
  `CourseCardSchema`, `CourseDetailSchema`, `EditionSchema`, `AreaSchema`…), modalidades y
  tratamiento tributario con sus etiquetas en español, `SlugSchema`, `availableSeats` y
  `startOfLocalDay`/`nextIsoDate` para filtrar por días de Punta Arenas.
- **API**: formato único de error (`ErrorResponseSchema`) y esquemas de salud.

```bash
pnpm build   # compila a dist/ (lo consume la API en producción)
pnpm test
```
