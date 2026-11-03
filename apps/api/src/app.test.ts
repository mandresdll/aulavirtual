import { HealthResponseSchema } from '@plataforma/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import { createIntegrations } from './integrations/index.js';
import { AppError } from './lib/errors.js';
import { testEnv } from './test-support.js';

let app: FastifyInstance | undefined;

async function createApp(
  options: {
    readinessChecks?: Record<string, () => Promise<void>>;
    env?: Record<string, string>;
  } = {},
) {
  const env = testEnv(options.env);
  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: options.readinessChecks ?? { database: async () => {} },
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health endpoints', () => {
  it('GET /api/health reports liveness', async () => {
    const response = await (await createApp()).inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json()).status).toBe('ok');
  });

  it('GET /api/ready is 200 when every dependency is up', async () => {
    const response = await (
      await createApp({ readinessChecks: { database: async () => {}, redis: async () => {} } })
    ).inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ready',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('GET /api/ready is 503 when a dependency is down', async () => {
    const response = await (
      await createApp({
        readinessChecks: {
          database: async () => {},
          redis: async () => {
            throw new Error('ECONNREFUSED');
          },
        },
      })
    ).inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'not_ready',
      checks: { redis: { status: 'down' } },
    });
  });
});

describe('error handling', () => {
  it('answers unknown routes with a Spanish 404 in the standard format', async () => {
    const response = await (await createApp()).inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' },
    });
    expect(response.json().error.requestId).toBe(response.headers['x-request-id']);
  });

  it('reports Zod validation errors with field details', async () => {
    const instance = await createApp();
    instance
      .withTypeProvider<ZodTypeProvider>()
      .post(
        '/api/test/echo',
        { schema: { body: z.object({ email: z.email() }) } },
        async (request) => request.body,
      );
    const response = await instance.inject({
      method: 'POST',
      url: '/api/test/echo',
      payload: { email: 'no-es-un-correo' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Los datos enviados no son válidos.');
    expect(body.error.details[0].path).toContain('email');
  });

  it('maps AppError to its status and message', async () => {
    const instance = await createApp();
    instance.get('/api/test/forbidden', async () => {
      throw AppError.forbidden();
    });
    const response = await instance.inject({ method: 'GET', url: '/api/test/forbidden' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('hides internal details of unexpected errors', async () => {
    const instance = await createApp();
    instance.get('/api/test/boom', async () => {
      throw new Error('database password is hunter2');
    });
    const response = await instance.inject({ method: 'GET', url: '/api/test/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('hunter2');
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
  });
});

describe('security', () => {
  it('sets security headers and echoes the request id', async () => {
    const response = await (
      await createApp()
    ).inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'req-123' },
    });
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBe('req-123');
  });

  it('allows CORS only from configured origins', async () => {
    const instance = await createApp({ env: { CORS_ORIGINS: 'https://cursos.example.cl' } });
    const allowed = await instance.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://cursos.example.cl' },
    });
    const denied = await instance.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://cursos.example.cl');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits by IP with a Spanish 429', async () => {
    const instance = await createApp({ env: { RATE_LIMIT_MAX: '2' } });
    instance.get('/api/test/limited', async () => ({ ok: true }));
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 3; i++) {
      last = await instance.inject({ method: 'GET', url: '/api/test/limited' });
      statuses.push(last.statusCode);
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect(last?.json().error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(last?.headers['retry-after']).toBeDefined();
  });
});

describe('OpenAPI', () => {
  it('serves the generated OpenAPI document with the health routes', async () => {
    const response = await (await createApp()).inject({ method: 'GET', url: '/api/docs/json' });
    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/health', '/api/ready']),
    );
  });

  it('serves Swagger UI at /api/docs', async () => {
    const response = await (await createApp()).inject({ method: 'GET', url: '/api/docs/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});
