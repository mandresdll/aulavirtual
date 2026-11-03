import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parseEnv } from '../../src/config/env.js';
import { createPrismaClient, databaseReadinessCheck } from '../../src/infra/database.js';
import { createRedis, redisReadinessCheck } from '../../src/infra/redis.js';
import { createIntegrations } from '../../src/integrations/index.js';

const env = parseEnv({
  APP_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  REDIS_URL: process.env.TEST_REDIS_URL,
  MAILER_DRIVER: 'memory',
  RATE_LIMIT_MAX: '3',
});

let prisma: PrismaClient;
let redis: Redis;
let app: FastifyInstance;

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  redis = createRedis(env.REDIS_URL);
  await redis.connect();
  await redis.flushdb();
  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {
      database: databaseReadinessCheck(prisma),
      redis: redisReadinessCheck(redis),
    },
    redis,
  });
  // Las rutas deben registrarse antes del primer `inject`, que deja la app iniciada.
  app.get('/api/test/limited', async () => ({ ok: true }));
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  redis?.disconnect();
});

describe('API against real PostgreSQL and Redis', () => {
  it('is ready when both dependencies respond', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ready',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('has applied the migrations', async () => {
    await prisma.setting.upsert({
      where: { key: 'integration-test' },
      create: { key: 'integration-test', value: { ok: true } },
      update: { value: { ok: true } },
    });
    const stored = await prisma.setting.findUnique({ where: { key: 'integration-test' } });
    expect(stored?.value).toEqual({ ok: true });
  });

  it('shares the rate-limit counter through Redis', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await app.inject({ method: 'GET', url: '/api/test/limited' })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(await redis.keys('rate-limit:*')).not.toHaveLength(0);
  });
});
