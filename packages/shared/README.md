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
- **SEG datos personales** (`api/privacy.ts`): solicitudes de titulares y permiso `privacy:manage`.
- **RF-02** (`api/diffusion.ts`): interesados, novedades, `LEAD_CONSENT`, `parseUtm` y
  `buildUtmLink`.
- **RF-08 / RF-09** (`api/sales.ts`): ventas, documentos, conciliación y reportes. Permisos
  `sales:manage`, `reports:read` y `diffusion:manage`.
- **RF-06** (`api/certificates.ts`): `VerificationSchema`, `MyCoursesSchema`, esquemas del panel
  de certificados y permiso `certificates:manage`.
- **RF-03 / RF-04 / RF-11** (`api/commerce.ts`):
  - Carrito (`CART_MAX_ITEMS`) y cupones (`CouponInputSchema` con reglas de alcance y
    vigencia).
  - Textos legales con sus etiquetas y rutas públicas.
  - Checkout: `CreateOrderSchema`, datos de factura con `RutSchema`, `IDEMPOTENCY_HEADER`.
  - Estados de orden con etiquetas en español.
- **RF-03 Pago** (`api/commerce.ts`): `MAX_PAYMENT_ATTEMPTS`, estados de pago y devolución con
  etiquetas, `RefundRequestSchema`, `AdminOrderSchema` y el permiso `orders:refund`.
- **RF-04 / RF-05** (`api/enrollment.ts`): estados y orígenes de inscripción con etiquetas,
  `MyEnrollmentsSchema` y esquemas del panel. Permiso `enrollments:manage`.
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
