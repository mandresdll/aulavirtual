import {
  ErrorResponseSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
  type ReadinessResponse,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export type ReadinessCheck = () => Promise<void>;

export interface HealthRoutesOptions {
  version: string;
  readinessChecks: Record<string, ReadinessCheck>;
  checkTimeoutMs?: number;
}

async function runCheck(check: ReadinessCheck, timeoutMs: number) {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return { status: 'up' as const, latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { status: 'down' as const, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (app, options) => {
  const timeoutMs = options.checkTimeoutMs ?? 2_000;

  app.get(
    '/health',
    {
      config: { access: 'public', rateLimit: false },
      schema: {
        tags: ['sistema'],
        summary: 'Liveness: el proceso responde',
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      version: options.version,
      time: new Date().toISOString(),
    }),
  );

  app.get(
    '/ready',
    {
      config: { access: 'public', rateLimit: false },
      schema: {
        tags: ['sistema'],
        summary: 'Readiness: dependencias (PostgreSQL, Redis) disponibles',
        response: {
          200: ReadinessResponseSchema,
          503: ReadinessResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const entries = await Promise.all(
        Object.entries(options.readinessChecks).map(
          async ([name, check]) => [name, await runCheck(check, timeoutMs)] as const,
        ),
      );
      const checks = Object.fromEntries(entries);
      const ready = entries.every(([, result]) => result.status === 'up');
      const payload: ReadinessResponse = { status: ready ? 'ready' : 'not_ready', checks };
      return reply.status(ready ? 200 : 503).send(payload);
    },
  );
};
