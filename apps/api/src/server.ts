import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { ConfigError, parseEnv } from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import { createPrismaClient, databaseReadinessCheck } from './infra/database.js';
import { createRedis, redisReadinessCheck } from './infra/redis.js';
import { createIntegrations } from './integrations/index.js';

// En desarrollo se lee el `.env` de la raíz del monorepo; en contenedores llegan por entorno.
const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

async function main() {
  const env = parseEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);

  const app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {
      database: databaseReadinessCheck(prisma),
      redis: redisReadinessCheck(redis),
    },
    prisma,
    redis,
    logger: buildLoggerOptions(env),
  });

  // Sin este listener, una caída de Redis terminaría el proceso; /api/ready la reporta.
  redis.on('error', (error) => app.log.warn({ err: error }, 'Redis connection error'));
  redis.connect().catch(() => {
    // El error ya se registró con el listener; ioredis sigue reintentando.
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
