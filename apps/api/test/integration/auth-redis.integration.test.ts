import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { RedisCache } from '../../src/infra/cache.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createRedis } from '../../src/infra/redis.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { RedisSessionStore } from '../../src/modules/auth/session-store.js';
import { loginAs } from '../../src/test-support.js';
import { integrationEnv } from './helpers.js';

/**
 * Sesiones, transacción de login y caché de roles en Redis real (RF-10): lo que las pruebas
 * unitarias simulan en memoria.
 */
const env = integrationEnv({
  SESSION_IDLE_TIMEOUT_SECONDS: '900',
  SGA_ROLES_CACHE_TTL_SECONDS: '120',
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
    readinessChecks: {},
    prisma,
    redis,
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('sessions in Redis', () => {
  it('stores the session server-side with the idle timeout and only an id in the cookie', async () => {
    const { cookie } = await loginAs(app, 'mock-admin');
    const id = cookie.split('=')[1] ?? '';
    const ttl = await redis.ttl(`session:${id}`);
    expect(ttl).toBeGreaterThan(800);
    expect(ttl).toBeLessThanOrEqual(900);
    const stored = JSON.parse((await redis.get(`session:${id}`)) ?? '{}');
    expect(stored).toMatchObject({ subject: 'mock-admin', csrfToken: expect.any(String) });
  });

  it('consumes the login transaction exactly once', async () => {
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    const loginCookie = login.cookies.find((item) => item.name === '__Host-login');
    expect(await redis.exists(`session:login:${loginCookie?.value}`)).toBe(1);

    const state = new URL(String(login.headers.location)).searchParams.get('state') ?? '';
    await app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=mock-editor&state=${state}`,
      headers: { cookie: `__Host-login=${loginCookie?.value}` },
    });
    expect(await redis.exists(`session:login:${loginCookie?.value}`)).toBe(0);
  });

  it('caches the SGA roles with SGA_ROLES_CACHE_TTL_SECONDS', async () => {
    await loginAs(app, 'mock-finance');
    const ttl = await redis.ttl('cache:sga:roles:v1:mock-finance');
    expect(ttl).toBeGreaterThan(100);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('deletes a session on logout', async () => {
    const store = new RedisSessionStore(redis);
    await store.set('to-delete', { a: 1 }, 60);
    expect(await store.take('to-delete')).toEqual({ a: 1 });
    expect(await store.get('to-delete')).toBeNull();
  });
});

describe('cache invalidation by prefix', () => {
  it('deletes every list page and treats wildcards in the prefix literally', async () => {
    const cache = new RedisCache(redis, 'cache:');
    await redis.set('cache:catalog:v1:list:{"page":1}', '1');
    await redis.set('cache:catalog:v1:list:{"page":2}', '1');
    await redis.set('cache:catalog:v1:course:otro', '1');
    await redis.set('cache:literal*x', '1');
    await redis.set('cache:literalAx', '1');

    await cache.deleteByPrefix('catalog:v1:list:');
    expect(await redis.keys('cache:catalog:v1:list:*')).toEqual([]);
    expect(await redis.exists('cache:catalog:v1:course:otro')).toBe(1);

    await cache.deleteByPrefix('literal*');
    expect(await redis.exists('cache:literal*x')).toBe(0);
    expect(await redis.exists('cache:literalAx')).toBe(1);
  });
});
