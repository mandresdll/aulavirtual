import { CSRF_HEADER, PERMISSIONS, type Permission } from '@plataforma/shared';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createIntegrations } from '../../integrations/index.js';
import { MOCK_IDENTITIES } from '../../integrations/mock-identities.js';
import {
  loginAs,
  MemoryAuditRecorder,
  MemoryCache,
  MemoryUserRepository,
  testEnv,
  unusedPrismaClient,
  type TestSession,
} from '../../test-support.js';
import { MemorySessionStore } from '../auth/session-store.js';

/**
 * Autorización por rol de todas las rutas del panel (SEG: deny by default). Las rutas se toman
 * del documento OpenAPI, así que una ruta nueva sin entrada en `EXPECTED` hace fallar la prueba.
 * Sin base de datos: una petición autorizada llega al servicio y falla ahí (500), lo que basta
 * para saber que la guardia la dejó pasar.
 */
const EXPECTED: Record<string, Permission> = {
  'GET /api/admin/areas': 'catalog:manage',
  'POST /api/admin/areas': 'catalog:manage',
  'PUT /api/admin/areas/{id}': 'catalog:manage',
  'DELETE /api/admin/areas/{id}': 'catalog:manage',
  'GET /api/admin/instructors': 'catalog:manage',
  'POST /api/admin/instructors': 'catalog:manage',
  'PUT /api/admin/instructors/{id}': 'catalog:manage',
  'DELETE /api/admin/instructors/{id}': 'catalog:manage',
  'GET /api/admin/courses': 'catalog:read',
  'POST /api/admin/courses': 'catalog:manage',
  'GET /api/admin/courses/{id}': 'catalog:read',
  'PUT /api/admin/courses/{id}': 'catalog:manage',
  'POST /api/admin/courses/{id}/publish': 'catalog:manage',
  'POST /api/admin/courses/{id}/unpublish': 'catalog:manage',
  'POST /api/admin/courses/{id}/archive': 'catalog:manage',
  'POST /api/admin/courses/{id}/editions': 'catalog:manage',
  'PUT /api/admin/editions/{id}': 'catalog:manage',
  'POST /api/admin/editions/{id}/publish': 'catalog:manage',
  'POST /api/admin/editions/{id}/unpublish': 'catalog:manage',
  'POST /api/admin/editions/{id}/duplicate': 'catalog:manage',
  'DELETE /api/admin/editions/{id}': 'catalog:manage',
  'GET /api/admin/coupons': 'coupons:manage',
  'POST /api/admin/coupons': 'coupons:manage',
  'PUT /api/admin/coupons/{id}': 'coupons:manage',
  'GET /api/admin/legal': 'legal:manage',
  'POST /api/admin/legal': 'legal:manage',
  'GET /api/admin/orders/{number}': 'orders:refund',
  'POST /api/admin/orders/{number}/refunds': 'orders:refund',
  'GET /api/admin/enrollments': 'enrollments:manage',
  'POST /api/admin/enrollments/{id}/retry': 'enrollments:manage',
  'GET /api/admin/waitlist': 'enrollments:manage',
  'GET /api/admin/sales': 'sales:manage',
  'GET /api/admin/sales/export': 'sales:manage',
  'GET /api/admin/documents': 'sales:manage',
  'POST /api/admin/documents/export': 'sales:manage',
  'POST /api/admin/documents/{id}/folio': 'sales:manage',
  'POST /api/admin/documents/{id}/retry': 'sales:manage',
  'GET /api/admin/reconciliation': 'sales:manage',
  'POST /api/admin/reconciliation': 'sales:manage',
  'POST /api/admin/reconciliation/{id}/resolve': 'sales:manage',
  'GET /api/admin/reports': 'reports:read',
  'GET /api/admin/reports/export': 'reports:read',
  'GET /api/admin/leads': 'diffusion:manage',
  'GET /api/admin/campaigns': 'diffusion:manage',
  'POST /api/admin/campaigns': 'diffusion:manage',
  'POST /api/admin/campaigns/{id}/send': 'diffusion:manage',
  'POST /api/admin/data-subjects/search': 'privacy:manage',
  'POST /api/admin/data-subjects/export': 'privacy:manage',
  'POST /api/admin/data-subjects/anonymize': 'privacy:manage',
  'GET /api/admin/certificates': 'certificates:manage',
  'POST /api/admin/certificates/{id}/reissue': 'certificates:manage',
  'POST /api/admin/certificates/{id}/revoke': 'certificates:manage',
  'GET /api/admin/enrollments/review': 'certificates:manage',
  'POST /api/admin/enrollments/{id}/result': 'certificates:manage',
  'POST /api/admin/editions/{id}/sync-results': 'certificates:manage',
  'GET /api/admin/audit': 'audit:read',
};

const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';
const SAMPLE_ORDER = 'UTA-2026-000001';
const WEB_URL = 'https://cursos.example.cl';

let app: FastifyInstance;
let routes: { method: HTTPMethods; path: string; key: string }[];
const sessions = new Map<string, TestSession>();

beforeAll(async () => {
  const env = testEnv({ PUBLIC_WEB_URL: WEB_URL });
  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma: unusedPrismaClient(),
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
    audit: new MemoryAuditRecorder(),
    users: new MemoryUserRepository(),
  });

  const document = (await app.inject('/api/docs/json')).json() as {
    paths: Record<string, Record<string, unknown>>;
  };
  routes = Object.entries(document.paths)
    .filter(([path]) => path.startsWith('/api/admin'))
    .flatMap(([path, operations]) =>
      Object.keys(operations).map((method) => ({
        method: method.toUpperCase() as HTTPMethods,
        path: path.replace('{id}', SAMPLE_ID).replace('{number}', SAMPLE_ORDER),
        key: `${method.toUpperCase()} ${path}`,
      })),
    );

  for (const identity of MOCK_IDENTITIES) {
    sessions.set(identity.subject, await loginAs(app, identity.subject));
  }
});

afterAll(async () => {
  await app.close();
});

function call(route: (typeof routes)[number], session?: TestSession, withCsrf = true) {
  return app.inject({
    method: route.method,
    url: route.path,
    headers: {
      origin: WEB_URL,
      ...(session ? { cookie: session.cookie } : {}),
      ...(session && withCsrf ? { [CSRF_HEADER]: session.csrfToken } : {}),
    },
    ...(['POST', 'PUT'].includes(route.method) ? { payload: {} } : {}),
  });
}

describe('admin API authorization', () => {
  it('covers every admin route in the expectations table', () => {
    expect(routes.map((route) => route.key).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('answers 401 to every admin route without a session', async () => {
    for (const route of routes) {
      const response = await call(route);
      expect(response.statusCode, route.key).toBe(401);
      expect(response.json().error.code, route.key).toBe('UNAUTHORIZED');
    }
  });

  for (const identity of MOCK_IDENTITIES) {
    it(`grants ${identity.subject} (${identity.platformRoles.join(', ')}) only what its roles allow`, async () => {
      const session = sessions.get(identity.subject);
      for (const route of routes) {
        const permission = EXPECTED[route.key] as Permission;
        const allowed = identity.platformRoles.some((role) =>
          (PERMISSIONS[permission] as readonly string[]).includes(role),
        );
        const response = await call(route, session);
        if (allowed) {
          expect([401, 403], route.key).not.toContain(response.statusCode);
        } else {
          expect(response.statusCode, route.key).toBe(403);
          expect(response.json().error.code, route.key).toBe('FORBIDDEN');
        }
      }
    });
  }

  it('rejects admin mutations without the CSRF token even for an admin', async () => {
    const session = sessions.get('mock-admin');
    for (const route of routes.filter((item) => item.method !== 'GET')) {
      const response = await call(route, session, false);
      expect(response.statusCode, route.key).toBe(403);
      expect(response.json().error.code, route.key).toBe('CSRF_REJECTED');
    }
  });

  it('marks admin responses as not cacheable', async () => {
    const response = await call(
      { method: 'GET', path: '/api/admin/audit', key: 'GET /api/admin/audit' },
      sessions.get('mock-editor'),
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
