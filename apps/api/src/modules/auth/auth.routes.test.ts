import { CSRF_HEADER, SessionResponseSchema } from '@plataforma/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { createIntegrations, type Integrations } from '../../integrations/index.js';
import { IntegrationError } from '../../integrations/errors.js';
import {
  loginAs,
  MemoryAuditRecorder,
  MemoryCache,
  MemoryUserRepository,
  testEnv,
  unusedPrismaClient,
} from '../../test-support.js';
import { MemorySessionStore } from './session-store.js';

const WEB_URL = 'https://cursos.example.cl';

let app: FastifyInstance | undefined;
let audit: MemoryAuditRecorder;
let users: MemoryUserRepository;
let clock: number;

async function createApp(
  options: { env?: Record<string, string>; integrations?: Partial<Integrations> } = {},
) {
  const env = testEnv({ PUBLIC_WEB_URL: WEB_URL, ...options.env });
  audit = new MemoryAuditRecorder();
  users = new MemoryUserRepository();
  clock = Date.parse('2026-06-01T12:00:00Z');
  app = await buildApp({
    env,
    integrations: { ...createIntegrations(env), ...options.integrations },
    readinessChecks: {},
    prisma: unusedPrismaClient(),
    sessionStore: new MemorySessionStore(() => clock),
    cache: new MemoryCache(),
    audit,
    users,
    now: () => new Date(clock),
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function startLogin(instance: FastifyInstance, returnTo = '/admin') {
  const response = await instance.inject({
    method: 'GET',
    url: `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  });
  const loginCookie = response.cookies.find((cookie) => cookie.name === '__Host-login');
  const location = response.headers.location;
  return {
    response,
    state: location ? (new URL(String(location)).searchParams.get('state') ?? '') : '',
    cookie: loginCookie ? `${loginCookie.name}=${loginCookie.value}` : '',
  };
}

function callback(instance: FastifyInstance, params: Record<string, string>, cookie: string) {
  return instance.inject({
    method: 'GET',
    url: `/api/auth/callback?${new URLSearchParams(params).toString()}`,
    headers: { cookie },
  });
}

async function session(instance: FastifyInstance, cookie: string) {
  const response = await instance.inject({
    method: 'GET',
    url: '/api/auth/session',
    headers: { cookie },
  });
  return SessionResponseSchema.parse(response.json());
}

describe('login with the mock identity provider', () => {
  it('redirects to the IdP on the web origin with a short-lived HttpOnly login cookie', async () => {
    const { response, cookie } = await startLogin(await createApp());
    expect(response.statusCode).toBe(302);
    expect(String(response.headers.location)).toMatch(
      new RegExp(`^${WEB_URL}/api/dev/mock-idp/authorize\\?state=`),
    );
    expect(cookie).not.toBe('');
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=600');
  });

  it('creates a server-side session, returns to the requested page and audits the login', async () => {
    const instance = await createApp();
    const { state, cookie } = await startLogin(instance, '/admin/cursos');
    const response = await callback(instance, { code: 'mock-editor', state }, cookie);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/admin/cursos');
    const sid = response.cookies.find((item) => item.name === '__Host-sid');
    expect(sid).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    // La cookie solo lleva un id aleatorio: ningún dato del usuario.
    expect(sid?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const current = await session(instance, `__Host-sid=${sid?.value}`);
    expect(current).toMatchObject({
      authenticated: true,
      user: {
        name: 'Editora UTA',
        email: 'editor.uta@example.com',
        roles: ['uta_editor', 'community_member'],
        profiles: ['staff'],
      },
    });
    expect(users.users.get('mock-editor')).toMatchObject({ sgaUserId: 'sga-0002' });
    expect(audit.entries).toEqual([
      expect.objectContaining({
        action: 'auth.login',
        entityType: 'user',
        actorId: 'user-1',
        requestId: expect.any(String),
      }),
    ]);
  });

  it('reports an anonymous session without a cookie', async () => {
    const instance = await createApp();
    expect(await session(instance, '')).toEqual({ authenticated: false });
    const response = await instance.inject({ method: 'GET', url: '/api/auth/session' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects open redirects in returnTo', async () => {
    const instance = await createApp();
    for (const returnTo of [
      '//evil.example.com',
      'https://evil.example.com',
      '/\\evil.example.com',
    ]) {
      const { response } = await startLogin(instance, returnTo);
      expect(response.statusCode).toBe(400);
    }
  });

  it('requires the login cookie of the same browser (login CSRF)', async () => {
    const instance = await createApp();
    const { state } = await startLogin(instance);
    const response = await callback(instance, { code: 'mock-admin', state }, '');
    expect(response.headers.location).toBe('/ingresar?error=expirado');
    expect(response.cookies.find((item) => item.name === '__Host-sid')).toBeUndefined();
  });

  it('rejects a state mismatch and does not accept the same login twice', async () => {
    const instance = await createApp();
    const { state, cookie } = await startLogin(instance);
    const wrong = await callback(instance, { code: 'mock-admin', state: 'otro' }, cookie);
    expect(wrong.headers.location).toBe('/ingresar?error=rechazado');

    const replay = await callback(instance, { code: 'mock-admin', state }, cookie);
    expect(replay.headers.location).toBe('/ingresar?error=expirado');
  });

  it('handles a login cancelled at the IdP', async () => {
    const instance = await createApp();
    const { state, cookie } = await startLogin(instance);
    const response = await callback(instance, { error: 'access_denied', state }, cookie);
    expect(response.headers.location).toBe('/ingresar?error=cancelado');
  });

  it('does not sign in when the SGA cannot confirm the roles', async () => {
    const instance = await createApp({
      integrations: {
        sga: {
          provider: 'failing',
          getUserRoles: async () => {
            throw new IntegrationError('sga', 'UNAVAILABLE', 'down', true);
          },
        },
      },
    });
    const { state, cookie } = await startLogin(instance);
    const response = await callback(instance, { code: 'mock-admin', state }, cookie);
    expect(response.headers.location).toBe('/ingresar?error=no-disponible');
    expect(response.cookies.find((item) => item.name === '__Host-sid')).toBeUndefined();
  });

  it('issues a new session id on every login (no session fixation)', async () => {
    const instance = await createApp();
    const first = await loginAs(instance, 'mock-student');
    const { state, cookie } = await startLogin(instance);
    const response = await callback(
      instance,
      { code: 'mock-admin', state },
      `${cookie}; ${first.cookie}`,
    );
    const second = response.cookies.find((item) => item.name === '__Host-sid');
    expect(`__Host-sid=${second?.value}`).not.toBe(first.cookie);
    expect(await session(instance, first.cookie)).toEqual({ authenticated: false });
  });

  it('ignores a tampered session cookie', async () => {
    const instance = await createApp();
    expect(await session(instance, '__Host-sid=../../etc/passwd')).toEqual({
      authenticated: false,
    });
    expect(await session(instance, `__Host-sid=${'a'.repeat(43)}`)).toEqual({
      authenticated: false,
    });
  });

  it('uses a plain cookie name when SESSION_COOKIE_SECURE=false', async () => {
    const instance = await createApp({ env: { SESSION_COOKIE_SECURE: 'false' } });
    const login = await loginAs(instance, 'mock-admin');
    expect(login.cookie).toMatch(/^sid=/);
  });
});

describe('session lifetime', () => {
  it('expires after the idle timeout and slides with activity', async () => {
    const instance = await createApp({ env: { SESSION_IDLE_TIMEOUT_SECONDS: '600' } });
    const { cookie } = await loginAs(instance, 'mock-admin');

    clock += 500_000;
    expect((await session(instance, cookie)).authenticated).toBe(true);
    clock += 500_000; // 1000 s desde el login, pero 500 s desde la última actividad.
    expect((await session(instance, cookie)).authenticated).toBe(true);
    clock += 601_000;
    expect((await session(instance, cookie)).authenticated).toBe(false);
  });

  it('expires after the absolute timeout even with activity', async () => {
    const instance = await createApp({
      env: { SESSION_IDLE_TIMEOUT_SECONDS: '600', SESSION_ABSOLUTE_TIMEOUT_SECONDS: '1000' },
    });
    const { cookie } = await loginAs(instance, 'mock-admin');
    clock += 500_000;
    expect((await session(instance, cookie)).authenticated).toBe(true);
    clock += 501_000;
    expect((await session(instance, cookie)).authenticated).toBe(false);
  });
});

describe('roles from the SGA', () => {
  it('caches the roles between requests and refreshes them on login', async () => {
    const env = testEnv();
    const sga = createIntegrations(env).sga;
    const spy = vi.spyOn(sga, 'getUserRoles');
    const instance = await createApp({ integrations: { sga } });

    const { cookie } = await loginAs(instance, 'mock-admin');
    const callsAfterLogin = spy.mock.calls.length;
    await session(instance, cookie);
    await session(instance, cookie);
    expect(spy.mock.calls.length).toBe(callsAfterLogin);

    await loginAs(instance, 'mock-admin');
    expect(spy.mock.calls.length).toBe(callsAfterLogin + 1);
  });

  it('gives no roles to a user the SGA does not know', async () => {
    const instance = await createApp({
      integrations: { sga: { provider: 'empty', getUserRoles: async () => null } },
    });
    const { cookie } = await loginAs(instance, 'mock-student');
    expect(await session(instance, cookie)).toMatchObject({
      authenticated: true,
      user: { roles: [], profiles: [] },
    });
  });
});

describe('logout and CSRF', () => {
  it('requires the CSRF token to log out', async () => {
    const instance = await createApp();
    const { cookie } = await loginAs(instance, 'mock-admin');
    const response = await instance.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('CSRF_REJECTED');
    expect((await session(instance, cookie)).authenticated).toBe(true);
  });

  it('rejects a mutation from another origin even with the token', async () => {
    const instance = await createApp();
    const { cookie, csrfToken } = await loginAs(instance, 'mock-admin');
    const response = await instance.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, [CSRF_HEADER]: csrfToken, origin: 'https://evil.example.com' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('destroys the session, clears the cookie and audits the logout', async () => {
    const instance = await createApp();
    const { cookie, csrfToken } = await loginAs(instance, 'mock-admin');
    const response = await instance.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, [CSRF_HEADER]: csrfToken, origin: WEB_URL },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ logoutUrl: null });
    expect(String(response.headers['set-cookie'])).toMatch(/__Host-sid=;/);
    expect((await session(instance, cookie)).authenticated).toBe(false);
    expect(audit.entries.map((entry) => entry.action)).toEqual(['auth.login', 'auth.logout']);
  });

  it('answers 401 to logout without a session', async () => {
    const instance = await createApp();
    const response = await instance.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(response.statusCode).toBe(401);
  });
});

describe('mock IdP page', () => {
  it('lists the demo identities and escapes the state', async () => {
    const instance = await createApp();
    const response = await instance.inject({
      method: 'GET',
      url: `/api/dev/mock-idp/authorize?state=${encodeURIComponent('"><script>')}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Administración UTA');
    expect(response.body).toContain('code=mock-admin');
    expect(response.body).not.toContain('<script>');
  });

  it('does not exist with the real OIDC adapter', async () => {
    const instance = await createApp({
      env: {
        IDENTITY_DRIVER: 'oidc',
        OIDC_ISSUER_URL: 'https://idp.example.cl',
        OIDC_CLIENT_ID: 'cursos',
        OIDC_CLIENT_SECRET: 'secret',
        OIDC_REDIRECT_URI: `${WEB_URL}/api/auth/callback`,
      },
    });
    const response = await instance.inject({
      method: 'GET',
      url: '/api/dev/mock-idp/authorize?state=x',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('login rate limit', () => {
  it('limits login attempts per IP', async () => {
    const instance = await createApp({ env: { AUTH_RATE_LIMIT_MAX: '2' } });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await startLogin(instance)).response.statusCode);
    expect(statuses).toEqual([302, 302, 429]);
  });
});
