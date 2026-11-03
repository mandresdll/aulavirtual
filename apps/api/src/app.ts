import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { LoggerOptions } from 'pino';
import type { Env } from './config/env.js';
import { NoCache, RedisCache, type Cache } from './infra/cache.js';
import type { Integrations } from './integrations/index.js';
import { PrismaCatalogRepository } from './modules/catalog/catalog.prisma-repository.js';
import type { CatalogRepository } from './modules/catalog/catalog.repository.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { healthRoutes, type ReadinessCheck } from './modules/health/health.routes.js';
import { seoRoutes } from './modules/seo/seo.routes.js';
import { auditPlugin } from './plugins/audit.js';
import { errorsPlugin } from './plugins/errors.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { securityPlugin } from './plugins/security.js';
import { swaggerPlugin } from './plugins/swagger.js';

export interface AppDependencies {
  env: Env;
  integrations: Integrations;
  readinessChecks: Record<string, ReadinessCheck>;
  prisma: PrismaClient;
  /** Conexión para el rate limit y la caché compartidos entre instancias. */
  redis?: Redis;
  logger?: LoggerOptions | false;
  /** Reemplaza el acceso a datos del catálogo (pruebas unitarias). */
  catalogRepository?: CatalogRepository;
  /** Reloj inyectable para pruebas. */
  now?: () => Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    integrations: Integrations;
  }
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { env } = deps;

  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: env.TRUST_PROXY,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.decorate('integrations', deps.integrations);

  await app.register(errorsPlugin);
  await app.register(securityPlugin, {
    corsOrigins: env.CORS_ORIGINS ?? [env.PUBLIC_WEB_URL],
  });
  await app.register(rateLimitPlugin, {
    max: env.RATE_LIMIT_MAX,
    timeWindowMs: env.RATE_LIMIT_WINDOW_MS,
    ...(deps.redis ? { redis: deps.redis } : {}),
  });
  await app.register(auditPlugin);
  await app.register(swaggerPlugin, { version: env.APP_VERSION });

  const cache: Cache = deps.redis
    ? new RedisCache(deps.redis, 'cache:', (error, operation) =>
        app.log.warn({ err: error, operation }, 'Cache unavailable, reading from the database'),
      )
    : new NoCache();
  const catalog = new CatalogService({
    repository: deps.catalogRepository ?? new PrismaCatalogRepository(deps.prisma),
    cache,
    catalogTtlSeconds: env.CATALOG_CACHE_TTL_SECONDS,
    seatsTtlSeconds: env.SEATS_CACHE_TTL_SECONDS,
    ...(deps.now ? { now: deps.now } : {}),
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, {
        version: env.APP_VERSION,
        readinessChecks: deps.readinessChecks,
      });
      await api.register(catalogRoutes, { catalog });
      await api.register(seoRoutes, {
        catalog,
        site: {
          baseUrl: env.PUBLIC_WEB_URL.replace(/\/+$/, ''),
          allowIndexing: env.SEO_ALLOW_INDEXING,
        },
        ...(deps.now ? { now: deps.now } : {}),
      });
    },
    { prefix: '/api' },
  );

  return app;
}
