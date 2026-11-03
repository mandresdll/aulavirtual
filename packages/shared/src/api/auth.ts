import { z } from 'zod';
import { CommunityProfileSchema, PlatformRoleSchema } from '../domain/roles.js';

/** Cabecera con el token CSRF que la SPA envía en cada mutación (POST, PUT, PATCH, DELETE). */
export const CSRF_HEADER = 'x-csrf-token';

export const SessionUserSchema = z.object({
  name: z.string(),
  email: z.string(),
  roles: z.array(PlatformRoleSchema),
  profiles: z.array(CommunityProfileSchema),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/** Estado de la sesión del navegador (RF-10). */
export const SessionResponseSchema = z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false) }),
  z.object({ authenticated: z.literal(true), user: SessionUserSchema, csrfToken: z.string() }),
]);
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const LogoutResponseSchema = z.object({
  /** Cierre de sesión en el IdP institucional, si lo ofrece. */
  logoutUrl: z.string().nullable(),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

/** Destino tras iniciar sesión: solo rutas internas de la SPA (evita redirecciones abiertas). */
export const ReturnToSchema = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'Debe ser una ruta interna');
