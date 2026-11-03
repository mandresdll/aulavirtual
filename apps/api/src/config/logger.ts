import type { FastifyRequest } from 'fastify';
import type { LoggerOptions } from 'pino';
import type { Env } from './env.js';

/**
 * Rutas que nunca deben llegar a los logs: credenciales, tokens y datos personales.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.apiKey',
  '*.secret',
  '*.clientSecret',
  '*.rut',
  '*.email',
  '*.phone',
  '*.name',
  '*.firstName',
  '*.lastName',
  '*.address',
];

/** Elimina la query string: puede llevar tokens (p. ej. `token_ws` de la pasarela). */
export function stripQuery(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}

export function buildLoggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'APP_ENV'>): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    serializers: {
      req(request: FastifyRequest) {
        return { id: request.id, method: request.method, url: stripQuery(request.url) };
      },
    },
    ...(env.APP_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
      : {}),
  };
}
