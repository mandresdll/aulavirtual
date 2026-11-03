import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../lib/errors.js';
import type { SessionStore } from './session-store.js';

/** Datos de la sesión guardados en el servidor. Sin roles: se consultan al SGA (con caché). */
export interface SessionData {
  userId: string;
  subject: string;
  name: string;
  email: string;
  csrfToken: string;
  /** Inicio de sesión (epoch ms): limita la duración máxima. */
  createdAt: number;
  /** Para pedir el cierre de sesión en el IdP. */
  idToken?: string;
}

/** Transacción de inicio de sesión: valida el retorno del IdP (state, nonce, PKCE). */
export interface LoginTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export interface SessionOptions {
  store: SessionStore;
  idleTimeoutSeconds: number;
  absoluteTimeoutSeconds: number;
  /** Cookie `Secure` (y prefijo `__Host-`). */
  secure: boolean;
  now?: () => number;
}

export interface SessionManager {
  /** Crea una sesión nueva con un identificador nuevo (evita la fijación de sesión). */
  create(
    request: FastifyRequest,
    reply: FastifyReply,
    data: Omit<SessionData, 'csrfToken' | 'createdAt'>,
  ): Promise<SessionData>;
  destroy(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  startLogin(reply: FastifyReply, transaction: LoginTransaction): Promise<void>;
  /** Devuelve la transacción de login una sola vez y borra su cookie. */
  finishLogin(request: FastifyRequest, reply: FastifyReply): Promise<LoginTransaction | null>;
}

declare module 'fastify' {
  interface FastifyInstance {
    sessions: SessionManager;
  }
  interface FastifyRequest {
    session: SessionData | null;
    sessionId: string | null;
  }
}

const LOGIN_TTL_SECONDS = 600;
const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const newId = () => randomBytes(32).toString('base64url');

/**
 * Sesiones con cookie `HttpOnly` + `Secure` + `SameSite=Lax` que solo contiene un id aleatorio;
 * los datos viven en Redis con cierre por inactividad y duración máxima. Si el almacén falla
 * al leer, la petición sigue como anónima (las rutas protegidas responden 401).
 */
export const sessionPlugin = fp<SessionOptions>(
  async (app: FastifyInstance, options) => {
    const { store, idleTimeoutSeconds, absoluteTimeoutSeconds, secure } = options;
    const now = options.now ?? Date.now;
    const sessionCookie = secure ? '__Host-sid' : 'sid';
    const loginCookie = secure ? '__Host-login' : 'login';
    const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const;

    await app.register(cookie);

    app.decorateRequest('session', null);
    app.decorateRequest('sessionId', null);

    app.addHook('onRequest', async (request) => {
      const id = request.cookies[sessionCookie];
      if (!id || !ID_PATTERN.test(id)) return;
      try {
        const data = await store.get<SessionData>(id);
        if (!data) return;
        if (now() - data.createdAt > absoluteTimeoutSeconds * 1000) {
          await store.delete(id);
          return;
        }
        await store.touch(id, idleTimeoutSeconds);
        request.session = data;
        request.sessionId = id;
      } catch (error) {
        request.log.warn({ err: error }, 'Session store unavailable');
      }
    });

    const unavailable = (error: unknown) => {
      app.log.error({ err: error }, 'Session store unavailable');
      return new AppError(
        503,
        'SESSION_UNAVAILABLE',
        'No pudimos iniciar tu sesión en este momento. Intenta nuevamente en unos minutos.',
      );
    };

    const manager: SessionManager = {
      async create(request, reply, data) {
        if (request.sessionId) await store.delete(request.sessionId).catch(() => {});
        const id = newId();
        const session: SessionData = { ...data, csrfToken: newId(), createdAt: now() };
        try {
          await store.set(id, session, idleTimeoutSeconds);
        } catch (error) {
          throw unavailable(error);
        }
        reply.setCookie(sessionCookie, id, cookieOptions);
        request.session = session;
        request.sessionId = id;
        return session;
      },

      async destroy(request, reply) {
        if (request.sessionId) await store.delete(request.sessionId);
        reply.clearCookie(sessionCookie, cookieOptions);
        request.session = null;
        request.sessionId = null;
      },

      async startLogin(reply, transaction) {
        const id = newId();
        try {
          await store.set(`login:${id}`, transaction, LOGIN_TTL_SECONDS);
        } catch (error) {
          throw unavailable(error);
        }
        reply.setCookie(loginCookie, id, { ...cookieOptions, maxAge: LOGIN_TTL_SECONDS });
      },

      async finishLogin(request, reply) {
        const id = request.cookies[loginCookie];
        reply.clearCookie(loginCookie, cookieOptions);
        if (!id || !ID_PATTERN.test(id)) return null;
        try {
          return await store.take<LoginTransaction>(`login:${id}`);
        } catch (error) {
          throw unavailable(error);
        }
      },
    };

    app.decorate('sessions', manager);
  },
  { name: 'session' },
);
