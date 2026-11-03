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
import { adminRoutes } from './modules/admin/admin.routes.js';
import { AdminAreasService, AdminInstructorsService } from './modules/admin/areas.service.js';
import { AuditLogService } from './modules/admin/audit-log.service.js';
import { AdminCoursesService } from './modules/admin/courses.service.js';
import { CatalogCacheInvalidator } from './modules/admin/support.js';
import { accessPlugin } from './modules/auth/access.plugin.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { mockIdpRoutes } from './modules/auth/mock-idp.routes.js';
import { RoleResolver } from './modules/auth/roles.js';
import {
  MemorySessionStore,
  RedisSessionStore,
  type SessionStore,
} from './modules/auth/session-store.js';
import { sessionPlugin } from './modules/auth/session.plugin.js';
import { PrismaUserRepository, type UserRepository } from './modules/auth/users.js';
import { PrismaCatalogRepository } from './modules/catalog/catalog.prisma-repository.js';
import type { CatalogRepository } from './modules/catalog/catalog.repository.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { healthRoutes, type ReadinessCheck } from './modules/health/health.routes.js';
import { seoRoutes } from './modules/seo/seo.routes.js';
import { auditPlugin, PrismaAuditRecorder, type AuditRecorder } from './plugins/audit.js';
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
  /** Reemplaza el almacén de sesiones (pruebas unitarias). Por defecto Redis. */
  sessionStore?: SessionStore;
  /** Reemplaza el registro de usuarios al iniciar sesión (pruebas unitarias). */
  users?: UserRepository;
  /** Reemplaza la auditoría persistente (pruebas unitarias). */
  audit?: AuditRecorder;
  /** Reemplaza la caché (pruebas unitarias). Por defecto Redis si hay conexión. */
  cache?: Cache;
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
  const cache: Cache =
    deps.cache ??
    (deps.redis
      ? new RedisCache(deps.redis, 'cache:', (error, operation) =>
          app.log.warn({ err: error, operation }, 'Cache unavailable, reading from the source'),
        )
      : new NoCache());
  const roles = new RoleResolver(deps.integrations.sga, cache, env.SGA_ROLES_CACHE_TTL_SECONDS);
  const webUrl = env.PUBLIC_WEB_URL.replace(/\/+$/, '');

  const recorder = deps.audit ?? new PrismaAuditRecorder(deps.prisma);

  await app.register(sessionPlugin, {
    store:
      deps.sessionStore ??
      (deps.redis ? new RedisSessionStore(deps.redis) : new MemorySessionStore()),
    idleTimeoutSeconds: env.SESSION_IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: env.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    secure: env.SESSION_COOKIE_SECURE,
    ...(deps.now ? { now: () => (deps.now as () => Date)().getTime() } : {}),
  });
  await app.register(auditPlugin, { recorder });
  await app.register(accessPlugin, {
    roles,
    allowedOrigins: [env.PUBLIC_WEB_URL, ...(env.CORS_ORIGINS ?? [])],
  });
  await app.register(swaggerPlugin, { version: env.APP_VERSION });

  const catalog = new CatalogService({
    repository: deps.catalogRepository ?? new PrismaCatalogRepository(deps.prisma),
    cache,
    catalogTtlSeconds: env.CATALOG_CACHE_TTL_SECONDS,
    seatsTtlSeconds: env.SEATS_CACHE_TTL_SECONDS,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const adminDeps = {
    prisma: deps.prisma,
    audit: recorder,
    invalidator: new CatalogCacheInvalidator(cache),
  };

  await app.register(
    async (api) => {
      await api.register(healthRoutes, {
        version: env.APP_VERSION,
        readinessChecks: deps.readinessChecks,
      });
      await api.register(catalogRoutes, { catalog });
      await api.register(authRoutes, {
        identity: deps.integrations.identity,
        roles,
        users: deps.users ?? new PrismaUserRepository(deps.prisma),
        callbackUrl: env.OIDC_REDIRECT_URI ?? `${webUrl}/api/auth/callback`,
        webUrl,
        rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
      });
      if (env.IDENTITY_DRIVER === 'mock') await api.register(mockIdpRoutes);
      await api.register(adminRoutes, {
        areas: new AdminAreasService(adminDeps),
        instructors: new AdminInstructorsService(adminDeps),
        courses: new AdminCoursesService(adminDeps),
        auditLog: new AuditLogService(deps.prisma),
      });
      await api.register(seoRoutes, {
        catalog,
        site: {
          baseUrl: webUrl,
          allowIndexing: env.SEO_ALLOW_INDEXING,
        },
        ...(deps.now ? { now: deps.now } : {}),
      });
    },
    { prefix: '/api' },
  );

  return app;
}
