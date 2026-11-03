import {
  ErrorResponseSchema,
  LogoutResponseSchema,
  ReturnToSchema,
  SessionResponseSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IntegrationError } from '../../integrations/errors.js';
import type { IdentityProvider } from '../../integrations/identity/port.js';
import { AppError } from '../../lib/errors.js';
import { auditActor } from '../../plugins/audit.js';
import type { RoleResolver } from './roles.js';
import type { UserRepository } from './users.js';

export interface AuthRoutesOptions {
  identity: IdentityProvider;
  roles: RoleResolver;
  users: UserRepository;
  /** URL registrada en el IdP para el retorno (`{PUBLIC_WEB_URL}/api/auth/callback`). */
  callbackUrl: string;
  /** URL pública de la SPA: destino tras cerrar sesión en el IdP. */
  webUrl: string;
  rateLimit: { max: number; timeWindowMs: number };
}

/** Página de la SPA que explica por qué no se pudo ingresar. */
const LOGIN_PAGE = '/ingresar';
type LoginError = 'cancelado' | 'expirado' | 'rechazado' | 'no-disponible' | 'cuenta';
const loginError = (reason: LoginError) => `${LOGIN_PAGE}?error=${reason}`;

/**
 * Inicio de sesión con el IdP institucional (RF-10): Authorization Code + PKCE, sesión en
 * Redis con cookie HttpOnly y roles desde el SGA. Ver docs/arquitectura.md.
 */
export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { identity, roles, users } = options;
  const loginRateLimit = { max: options.rateLimit.max, timeWindow: options.rateLimit.timeWindowMs };

  app.get(
    '/auth/login',
    {
      config: { access: 'public', rateLimit: loginRateLimit },
      schema: {
        tags: ['autenticación'],
        summary: 'Redirige al proveedor de identidad institucional',
        querystring: z.object({ returnTo: ReturnToSchema.optional() }),
        response: { 400: ErrorResponseSchema, 429: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      let authorization: Awaited<ReturnType<IdentityProvider['createAuthorizationRequest']>>;
      try {
        authorization = await identity.createAuthorizationRequest();
      } catch (error) {
        request.log.error({ err: error }, 'Identity provider unavailable');
        return reply.redirect(loginError('no-disponible'));
      }
      await app.sessions.startLogin(reply, {
        state: authorization.state,
        nonce: authorization.nonce,
        codeVerifier: authorization.codeVerifier,
        returnTo: request.query.returnTo ?? '/',
      });
      return reply.redirect(authorization.url);
    },
  );

  app.get(
    '/auth/callback',
    {
      config: { access: 'public', rateLimit: loginRateLimit },
      schema: {
        tags: ['autenticación'],
        summary: 'Retorno del proveedor de identidad (crea la sesión)',
        response: { 429: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const transaction = await app.sessions.finishLogin(request, reply);
      const query = new URL(request.url, 'http://placeholder').searchParams;
      if (query.has('error')) return reply.redirect(loginError('cancelado'));
      if (!transaction) return reply.redirect(loginError('expirado'));

      const callbackUrl = new URL(options.callbackUrl);
      callbackUrl.search = query.toString();
      let claims: Awaited<ReturnType<IdentityProvider['completeAuthorization']>>;
      try {
        claims = await identity.completeAuthorization({
          callbackUrl,
          expectedState: transaction.state,
          expectedNonce: transaction.nonce,
          codeVerifier: transaction.codeVerifier,
        });
      } catch (error) {
        if (!(error instanceof IntegrationError)) throw error;
        request.log.warn({ code: error.code }, 'Login rejected by the identity provider');
        return reply.redirect(loginError(error.retryable ? 'no-disponible' : 'rechazado'));
      }

      let user: { id: string; created: boolean };
      try {
        const resolved = await roles.refresh(claims.subject);
        user = await users.upsertFromIdentity({
          subject: claims.subject,
          sgaUserId: resolved.sgaUserId,
          email: claims.email,
          name: claims.name,
        });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        request.log.warn({ code: error.code }, 'Login could not be completed');
        return reply.redirect(
          loginError(error.code === 'ACCOUNT_CONFLICT' ? 'cuenta' : 'no-disponible'),
        );
      }

      await app.sessions.create(request, reply, {
        userId: user.id,
        subject: claims.subject,
        name: claims.name,
        email: claims.email,
        ...(claims.idToken ? { idToken: claims.idToken } : {}),
      });
      await app.audit.record({
        ...auditActor(request),
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        ...(user.created ? { after: { created: true } } : {}),
      });
      return reply.redirect(transaction.returnTo);
    },
  );

  app.get(
    '/auth/session',
    {
      config: { access: 'public' },
      schema: {
        tags: ['autenticación'],
        summary: 'Usuario de la sesión actual, sus roles y el token CSRF',
        response: { 200: SessionResponseSchema, 503: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const session = request.session;
      if (!session) return { authenticated: false as const };
      const resolved = await roles.resolve(session.subject);
      return {
        authenticated: true as const,
        user: {
          name: session.name,
          email: session.email,
          roles: resolved.roles,
          profiles: resolved.profiles,
        },
        csrfToken: session.csrfToken,
      };
    },
  );

  app.post(
    '/auth/logout',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['autenticación'],
        summary: 'Cierra la sesión (requiere el token CSRF)',
        response: { 200: LogoutResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const idToken = request.session?.idToken;
      const actor = auditActor(request);
      await app.sessions.destroy(request, reply);
      await app.audit.record({
        ...actor,
        action: 'auth.logout',
        entityType: 'user',
        entityId: actor.actorId,
      });

      let logoutUrl: string | null = null;
      try {
        logoutUrl = await identity.getLogoutUrl({
          postLogoutRedirectUri: `${options.webUrl.replace(/\/+$/, '')}/`,
          ...(idToken ? { idTokenHint: idToken } : {}),
        });
      } catch (error) {
        request.log.warn({ err: error }, 'Could not build the IdP logout URL');
      }
      return { logoutUrl };
    },
  );
};
