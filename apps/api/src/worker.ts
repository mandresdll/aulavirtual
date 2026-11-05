import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'bullmq';
import pino from 'pino';
import { ConfigError, parseEnv } from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import { NoCache } from './infra/cache.js';
import { createPrismaClient } from './infra/database.js';
import { createQueueConnection } from './infra/redis.js';
import { CheckoutService } from './modules/checkout/checkout.service.js';
import { LegalService } from './modules/legal/legal.service.js';
import { PrismaAuditRecorder } from './plugins/audit.js';
import { createCheckoutProcessor } from './jobs/processors/checkout.js';
import { createSystemProcessor } from './jobs/processors/system.js';
import { QUEUE_NAMES, createQueue } from './jobs/queues.js';

const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const HEARTBEAT_EVERY_MS = 5 * 60_000;
const EXPIRE_ORDERS_EVERY_MS = 60_000;

async function main() {
  const env = parseEnv(process.env);
  const logger = pino(buildLoggerOptions(env));
  const connection = createQueueConnection(env.REDIS_URL);

  const systemQueue = createQueue(QUEUE_NAMES.system, connection);
  await systemQueue.upsertJobScheduler(
    'heartbeat',
    { every: HEARTBEAT_EVERY_MS },
    { name: 'heartbeat' },
  );

  const prisma = createPrismaClient(env.DATABASE_URL);
  const audit = new PrismaAuditRecorder(prisma);
  const checkout = new CheckoutService({
    prisma,
    audit,
    legal: new LegalService(prisma, audit),
    // La caché de cupos expira sola en segundos (SEATS_CACHE_TTL_SECONDS).
    cache: new NoCache(),
    reservationTtlMinutes: env.SEAT_RESERVATION_TTL_MINUTES,
  });
  const checkoutQueue = createQueue(QUEUE_NAMES.checkout, connection);
  await checkoutQueue.upsertJobScheduler(
    'expire-orders',
    { every: EXPIRE_ORDERS_EVERY_MS },
    { name: 'expire-orders', opts: { attempts: 1 } },
  );

  const workers = [
    new Worker(QUEUE_NAMES.system, createSystemProcessor(logger), { connection }),
    new Worker(QUEUE_NAMES.checkout, createCheckoutProcessor(checkout, logger), { connection }),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      logger.error({ queue: worker.name, jobId: job?.id, err: error }, 'Job failed');
    });
  }
  logger.info({ queues: workers.map((worker) => worker.name) }, 'Worker started');

  const shutdown = async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    await Promise.all([systemQueue.close(), checkoutQueue.close()]);
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
