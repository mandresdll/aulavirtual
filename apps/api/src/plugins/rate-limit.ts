import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Redis } from 'ioredis';

export interface RateLimitOptions {
  max: number;
  timeWindowMs: number;
  /** Sin Redis el contador queda en memoria (solo desarrollo y pruebas unitarias). */
  redis?: Redis;
}

/**
 * Límite por usuario con sesión y por IP sin ella: en la red del CFT muchas personas salen por la
 * misma IP y no deben agotar el límite entre sí. Las rutas sensibles (login, checkout, interés,
 * verificación) definen límites más estrictos con `config.rateLimit` en su propia ruta.
 */
export const rateLimitPlugin = fp<RateLimitOptions>(
  async (app: FastifyInstance, options) => {
    await app.register(rateLimit, {
      global: true,
      max: options.max,
      timeWindow: options.timeWindowMs,
      nameSpace: 'rate-limit:',
      // La sesión ya está cargada: los hooks de la app corren antes que los de la ruta.
      keyGenerator: (request) => (request.session ? `user:${request.session.subject}` : request.ip),
      // Si Redis cae, se atiende sin límite en vez de responder 500 a todo; /api/ready lo reporta.
      skipOnError: true,
      ...(options.redis ? { redis: options.redis } : {}),
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        message: `Rate limit exceeded, retry in ${context.after}`,
      }),
    });
  },
  { name: 'rate-limit' },
);
