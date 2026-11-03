import { parseEnv, type Env } from './config/env.js';

/** Variables mínimas válidas para construir la app en pruebas unitarias. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    MAILER_DRIVER: 'memory',
    ...overrides,
  });
}
