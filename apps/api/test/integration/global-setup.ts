import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Pruebas de integración contra PostgreSQL y Redis reales (contenedores de docker compose
 * en local, servicios de GitHub Actions en CI). Aplica las migraciones a la BD de pruebas.
 */
export default function setup() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const redisUrl = process.env.TEST_REDIS_URL;
  if (!databaseUrl || !redisUrl) {
    throw new Error(
      'Integration tests need TEST_DATABASE_URL and TEST_REDIS_URL. ' +
        'Start them with: docker compose up -d postgres redis (see README).',
    );
  }

  const apiDir = fileURLToPath(new URL('../..', import.meta.url));
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force', '--skip-seed'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
