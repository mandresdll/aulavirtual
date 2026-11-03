import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { LoggerOptions } from 'pino';
import type { Env } from './config/env.js';
import type { Integrations } from './integrations/index.js';
import { healthRoutes, type ReadinessCheck } from './modules/health/health.routes.js';
import { auditPlugin } from './plugins/audit.js';
import { errorsPlugin } from './plugins/errors.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { securityPlugin } from './plugins/security.js';
import { swaggerPlugin } from './plugins/swagger.js';

export interface AppDependencies {
  env: Env;
  integrations: Integrations;
  readinessChecks: Record<string, ReadinessCheck>;
  /** Conexión para el rate limit compartido entre instancias. */
  redis?: Redis;
  logger?: LoggerOptions | false;
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

  await app.register(
    async (api) => {
      await api.register(healthRoutes, {
        version: env.APP_VERSION,
        readinessChecks: deps.readinessChecks,
      });
    },
    { prefix: '/api' },
  );

  return app;
}
