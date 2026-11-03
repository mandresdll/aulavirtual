import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, parseEnv } from './config/env.js';
import { seedDemoData } from './db/demo-seed.js';
import { createPrismaClient } from './infra/database.js';

/** Carga los datos de demostración: `pnpm db:seed` en local, `node dist/seed.js` en compose. */
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

async function main() {
  const env = parseEnv(process.env);
  if (env.APP_ENV === 'production') {
    throw new Error('Demo data cannot be loaded with APP_ENV=production');
  }
  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const summary = await seedDemoData(prisma);
    console.warn(`Demo data ready: ${JSON.stringify(summary)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
