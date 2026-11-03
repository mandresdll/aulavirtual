import type { PrismaClient } from '@prisma/client';
import { CourseDetailSchema } from '@plataforma/shared';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createRedis } from '../../src/infra/redis.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/** Caché del catálogo en Redis real: fichas por `CATALOG_CACHE_TTL_SECONDS`, cupos aparte. */
const env = integrationEnv();

let prisma: PrismaClient;
let redis: Redis;
let app: FastifyInstance;
let editionId: string;

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  redis = createRedis(env.REDIS_URL);
  await redis.connect();
  await redis.flushdb();
  await resetCatalogData(prisma);

  const area = await prisma.area.create({ data: { slug: 'cache', name: 'Caché' } });
  const course = await prisma.course.create({
    data: {
      slug: 'curso-en-cache',
      title: 'Título original',
      summary: 'Resumen',
      description: 'Descripción',
      modality: 'online',
      durationHours: 8,
      areaId: area.id,
      status: 'published',
    },
  });
  const edition = await prisma.courseEdition.create({
    data: {
      courseId: course.id,
      code: 'CACHE-1',
      startsAt: daysFromNow(10),
      endsAt: daysFromNow(20),
      enrollmentClosesAt: daysFromNow(5),
      capacity: 5,
      priceClp: 1_000,
      status: 'published',
    },
  });
  editionId = edition.id;

  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma,
    redis,
  });
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  redis?.disconnect();
});

async function getCourse() {
  const response = await app.inject('/api/catalog/courses/curso-en-cache');
  expect(response.statusCode).toBe(200);
  return CourseDetailSchema.parse(response.json());
}

describe('catalog cache in Redis', () => {
  it('serves the course detail from Redis until the entry expires', async () => {
    expect((await getCourse()).title).toBe('Título original');
    await prisma.course.update({
      where: { slug: 'curso-en-cache' },
      data: { title: 'Título editado' },
    });
    expect((await getCourse()).title).toBe('Título original');

    const ttl = await redis.ttl('cache:catalog:v1:course:curso-en-cache');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(env.CATALOG_CACHE_TTL_SECONDS);

    await redis.del('cache:catalog:v1:course:curso-en-cache');
    expect((await getCourse()).title).toBe('Título editado');
  });

  it('keeps seats in their own short-lived entry', async () => {
    const key = `cache:catalog:v1:seats:${editionId}`;
    expect(JSON.parse((await redis.get(key)) ?? 'null')).toEqual({ taken: 0, reserved: 0 });
    expect(await redis.ttl(key)).toBeLessThanOrEqual(env.SEATS_CACHE_TTL_SECONDS);

    const user = await prisma.user.create({ data: { email: 'cache@example.com', name: 'C' } });
    await prisma.enrollment.create({ data: { userId: user.id, editionId, source: 'purchase' } });
    await redis.del(key);
    expect((await getCourse()).editions[0]?.availableSeats).toBe(4);
  });
});
