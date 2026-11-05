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
import { createIntegrations } from './integrations/index.js';
import { LegalService } from './modules/legal/legal.service.js';
import { PaymentsService } from './modules/payments/payments.service.js';
import { ReceiptsService } from './modules/payments/receipts.service.js';
import { PrismaAuditRecorder } from './plugins/audit.js';
import { createCheckoutProcessor } from './jobs/processors/checkout.js';
import { createSystemProcessor } from './jobs/processors/system.js';
import { QUEUE_NAMES, createQueue } from './jobs/queues.js';

const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const HEARTBEAT_EVERY_MS = 5 * 60_000;
const CHECKOUT_JOBS_EVERY_MS = 60_000;

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
  const integrations = createIntegrations(env);
  const webUrl = env.PUBLIC_WEB_URL.replace(/\/+$/, '');
  const payments = new PaymentsService({
    prisma,
    gateway: integrations.paymentGateway,
    mailer: integrations.mailer,
    audit,
    cache: new NoCache(),
    logger,
    returnUrl: `${webUrl}/api/payments/return`,
    ...(env.UTA_ALERT_EMAIL ? { alertEmail: env.UTA_ALERT_EMAIL } : {}),
  });
  const receipts = new ReceiptsService({
    prisma,
    mailer: integrations.mailer,
    provider: {
      name: env.SELLER_NAME,
      rut: env.SELLER_RUT,
      address: env.SELLER_ADDRESS,
      email: env.SELLER_EMAIL,
      phone: env.SELLER_PHONE,
    },
    logger,
    webUrl,
  });
  const checkoutQueue = createQueue(QUEUE_NAMES.checkout, connection);
  for (const name of ['expire-orders', 'recover-payments', 'send-receipts']) {
    await checkoutQueue.upsertJobScheduler(
      name,
      { every: CHECKOUT_JOBS_EVERY_MS },
      { name, opts: { attempts: 1 } },
    );
  }

  const workers = [
    new Worker(QUEUE_NAMES.system, createSystemProcessor(logger), { connection }),
    new Worker(
      QUEUE_NAMES.checkout,
      createCheckoutProcessor(
        {
          expireStaleOrders: () => checkout.expireStaleOrders(),
          recoverConfirmations: () => payments.recoverConfirmations(),
          sendPendingReceipts: () => receipts.sendPending(),
        },
        logger,
      ),
      { connection },
    ),
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
