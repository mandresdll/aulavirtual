import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createIntegrations } from '../integrations/index.js';
import { MemorySessionStore } from '../modules/auth/session-store.js';
import {
  loginAs,
  MemoryAuditRecorder,
  MemoryCache,
  MemoryUserRepository,
  testEnv,
  unusedPrismaClient,
} from '../test-support.js';

/** Personas distintas detrás de la misma IP (la red del CFT) no comparten el límite. */
describe('rate limit by user', () => {
  const MAX = 20;
  let app: FastifyInstance;

  beforeAll(async () => {
    const env = testEnv({ RATE_LIMIT_MAX: String(MAX) });
    app = await buildApp({
      env,
      integrations: createIntegrations(env),
      readinessChecks: {},
      prisma: unusedPrismaClient(),
      sessionStore: new MemorySessionStore(),
      users: new MemoryUserRepository(),
      audit: new MemoryAuditRecorder(),
      cache: new MemoryCache(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const session = (cookie?: string) =>
    app.inject({ url: '/api/auth/session', ...(cookie ? { headers: { cookie } } : {}) });

  it('limits each signed-in person apart, and anonymous visitors by IP', async () => {
    const first = await loginAs(app, 'mock-student');
    const second = await loginAs(app, 'mock-teacher');

    let status = 200;
    for (let i = 0; i <= MAX && status === 200; i++) {
      status = (await session(first.cookie)).statusCode;
    }
    expect(status).toBe(429);

    expect((await session(second.cookie)).statusCode).toBe(200);
    expect((await session()).statusCode).toBe(200);
  });
});
