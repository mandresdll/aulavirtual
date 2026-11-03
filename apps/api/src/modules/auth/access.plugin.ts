import { timingSafeEqual } from 'node:crypto';
import {
  CSRF_HEADER,
  hasPermission,
  type CommunityProfile,
  type Permission,
  type PlatformRole,
} from '@plataforma/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../lib/errors.js';
import type { RoleResolver } from './roles.js';
import type { SessionData } from './session.plugin.js';

/**
 * Acceso declarado por cada ruta en `config.access` (deny by default):
 * - `'public'`: sin sesión.
 * - `'authenticated'`: cualquier usuario con sesión.
 * - `{ permission }`: sesión y un rol que otorgue el permiso (`PERMISSIONS` de shared).
 */
export type RouteAccess = 'public' | 'authenticated' | { permission: Permission };

export interface AuthContext extends SessionData {
  sgaUserId: string | null;
  roles: PlatformRole[];
  profiles: CommunityProfile[];
}

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: RouteAccess;
  }
  interface FastifyRequest {
    /** Usuario autenticado con sus roles; `null` en rutas públicas. */
    auth: AuthContext | null;
  }
}

export interface AccessOptions {
  roles: RoleResolver;
  /** Orígenes desde los que se aceptan mutaciones con cookie (la SPA). */
  allowedOrigins: string[];
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Rutas bajo /api que registran plugins de terceros (documentación OpenAPI). */
const EXEMPT_PREFIXES = ['/api/docs'];

const CSRF_ERROR = new AppError(
  403,
  'CSRF_REJECTED',
  'La solicitud no es válida o tu sesión cambió. Recarga la página e intenta nuevamente.',
);

function sameToken(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Usuario de la petición; lanza 401 si la ruta se usa sin sesión (uso interno de rutas). */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw AppError.unauthorized();
  return request.auth;
}

/**
 * Control de acceso por rol en cada endpoint y CSRF en las mutaciones con sesión (SEG).
 * Una ruta bajo /api sin `config.access` impide que la API arranque: no hay rutas abiertas
 * por olvido.
 */
export const accessPlugin = fp<AccessOptions>(
  async (app: FastifyInstance, options) => {
    const allowedOrigins = new Set(options.allowedOrigins.map((origin) => new URL(origin).origin));

    app.decorateRequest('auth', null);

    app.addHook('onRoute', (route) => {
      if (!route.url.startsWith('/api/')) return;
      if (EXEMPT_PREFIXES.some((prefix) => route.url.startsWith(prefix))) return;
      if (route.config?.access === undefined) {
        const methods = [route.method].flat().join(',');
        throw new Error(
          `Route ${methods} ${route.url} must declare config.access (deny by default)`,
        );
      }
    });

    app.addHook('onRequest', async (request) => {
      // Sin ruta (404) o rutas exentas: no hay nada que proteger.
      const access = request.routeOptions.config.access;
      if (!request.routeOptions.url || access === undefined || access === 'public') return;

      const session = request.session;
      if (!session) throw AppError.unauthorized();

      if (!SAFE_METHODS.has(request.method)) {
        const origin = request.headers.origin;
        if (origin !== undefined && !allowedOrigins.has(origin)) throw CSRF_ERROR;
        const header = request.headers[CSRF_HEADER];
        if (!sameToken(session.csrfToken, typeof header === 'string' ? header : undefined)) {
          throw CSRF_ERROR;
        }
      }

      const resolved = await options.roles.resolve(session.subject);
      request.auth = { ...session, ...resolved };

      if (typeof access === 'object' && !hasPermission(resolved.roles, access.permission)) {
        throw AppError.forbidden();
      }
    });
  },
  { name: 'access', dependencies: ['session'] },
);
