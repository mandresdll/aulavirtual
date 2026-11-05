import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DISPLAY_TIME_ZONE } from '@plataforma/shared';
import { Worker } from 'bullmq';
import pino from 'pino';
import { ConfigError, DOCUMENT_COLUMN_KEYS, parseEnv } from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import { NoCache } from './infra/cache.js';
import { createPrismaClient } from './infra/database.js';
import { createQueueConnection } from './infra/redis.js';
import { CertificatesService } from './modules/certificates/certificates.service.js';
import { CheckoutService } from './modules/checkout/checkout.service.js';
import { CampaignsService } from './modules/diffusion/campaigns.service.js';
import { LeadsService } from './modules/diffusion/leads.service.js';
import { createIntegrations } from './integrations/index.js';
import { EnrollmentService } from './modules/enrollment/enrollment.service.js';
import { WaitlistService } from './modules/enrollment/waitlist.service.js';
import { LegalService } from './modules/legal/legal.service.js';
import { PaymentsService } from './modules/payments/payments.service.js';
import { ReceiptsService } from './modules/payments/receipts.service.js';
import { DocumentsService } from './modules/sales/documents.service.js';
import { ReconciliationService } from './modules/sales/reconciliation.service.js';
import { PrismaAuditRecorder } from './plugins/audit.js';
import { createCertificatesProcessor } from './jobs/processors/certificates.js';
import { createCheckoutProcessor } from './jobs/processors/checkout.js';
import { createEnrollmentProcessor } from './jobs/processors/enrollment.js';
import { createDiffusionProcessor, createSalesProcessor } from './jobs/processors/sales.js';
import { createSystemProcessor } from './jobs/processors/system.js';
import { QUEUE_NAMES, createQueue } from './jobs/queues.js';

const rootEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const HEARTBEAT_EVERY_MS = 5 * 60_000;
const CHECKOUT_JOBS_EVERY_MS = 60_000;
const RESULTS_SYNC_EVERY_MS = 60 * 60_000;
/** La conciliación revisa el día anterior, cada mañana en hora de Punta Arenas. */
const RECONCILIATION_SCHEDULE = { pattern: '0 6 * * *', tz: DISPLAY_TIME_ZONE };
const LEAD_PURGE_SCHEDULE = { pattern: '0 5 * * *', tz: DISPLAY_TIME_ZONE };

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
  const provider = {
    name: env.SELLER_NAME,
    rut: env.SELLER_RUT,
    address: env.SELLER_ADDRESS,
    email: env.SELLER_EMAIL,
    phone: env.SELLER_PHONE,
  };
  const receipts = new ReceiptsService({
    prisma,
    mailer: integrations.mailer,
    provider,
    logger,
    webUrl,
  });
  const certificates = new CertificatesService({
    prisma,
    lms: integrations.lms,
    validator: integrations.certificateValidator,
    mailer: integrations.mailer,
    audit,
    logger,
    provider,
    webUrl,
    graceDays: env.COURSE_RESULT_GRACE_DAYS,
    ...(env.MOODLE_URL ? { lmsUrl: env.MOODLE_URL } : {}),
  });
  const certificatesQueue = createQueue(QUEUE_NAMES.certificates, connection);
  await certificatesQueue.upsertJobScheduler(
    'sync-results',
    { every: RESULTS_SYNC_EVERY_MS },
    { name: 'sync-results', opts: { attempts: 1 } },
  );
  for (const name of ['send-certificates', 'sync-validator']) {
    await certificatesQueue.upsertJobScheduler(
      name,
      { every: CHECKOUT_JOBS_EVERY_MS },
      { name, opts: { attempts: 1 } },
    );
  }
  const enrollment = new EnrollmentService({
    prisma,
    lms: integrations.lms,
    mailer: integrations.mailer,
    audit,
    cache: new NoCache(),
    checkout,
    logger,
    webUrl,
    ...(env.MOODLE_URL ? { lmsUrl: env.MOODLE_URL } : {}),
    ...(env.UTA_ALERT_EMAIL ? { alertEmail: env.UTA_ALERT_EMAIL } : {}),
  });
  const waitlist = new WaitlistService({
    prisma,
    mailer: integrations.mailer,
    audit,
    checkout,
    logger,
    webUrl,
    offerHours: env.WAITLIST_OFFER_HOURS,
  });
  const enrollmentQueue = createQueue(QUEUE_NAMES.enrollment, connection);
  for (const name of [
    'sweep-enrollments',
    'send-welcomes',
    'sync-withdrawals',
    'advance-waitlists',
  ]) {
    await enrollmentQueue.upsertJobScheduler(
      name,
      { every: CHECKOUT_JOBS_EVERY_MS },
      { name, opts: { attempts: 1 } },
    );
  }

  const checkoutQueue = createQueue(QUEUE_NAMES.checkout, connection);
  for (const name of ['expire-orders', 'recover-payments', 'send-receipts']) {
    await checkoutQueue.upsertJobScheduler(
      name,
      { every: CHECKOUT_JOBS_EVERY_MS },
      { name, opts: { attempts: 1 } },
    );
  }

  const documents = new DocumentsService({
    prisma,
    gateway: integrations.invoicing,
    audit,
    logger,
    columns: env.INVOICING_EXPORT_COLUMNS ?? DOCUMENT_COLUMN_KEYS,
    vatPercent: env.VAT_RATE_PERCENT,
  });
  const reconciliation = new ReconciliationService({
    prisma,
    gateway: integrations.paymentGateway,
    mailer: integrations.mailer,
    audit,
    logger,
    ...(env.UTA_ALERT_EMAIL ? { alertEmail: env.UTA_ALERT_EMAIL } : {}),
  });
  const salesQueue = createQueue(QUEUE_NAMES.sales, connection);
  await salesQueue.upsertJobScheduler('reconcile-payments', RECONCILIATION_SCHEDULE, {
    name: 'reconcile-payments',
    opts: { attempts: 1 },
  });
  await salesQueue.upsertJobScheduler(
    'submit-documents',
    { every: CHECKOUT_JOBS_EVERY_MS },
    { name: 'submit-documents', opts: { attempts: 1 } },
  );

  const campaigns = new CampaignsService({
    prisma,
    mailer: integrations.mailer,
    audit,
    logger,
    webUrl,
  });
  const leads = new LeadsService({ prisma, audit, retentionDays: env.LEAD_RETENTION_DAYS });
  const diffusionQueue = createQueue(QUEUE_NAMES.diffusion, connection);
  await diffusionQueue.upsertJobScheduler('purge-leads', LEAD_PURGE_SCHEDULE, {
    name: 'purge-leads',
    opts: { attempts: 1 },
  });
  await diffusionQueue.upsertJobScheduler(
    'send-campaigns',
    { every: CHECKOUT_JOBS_EVERY_MS },
    { name: 'send-campaigns', opts: { attempts: 1 } },
  );

  const workers = [
    new Worker(QUEUE_NAMES.system, createSystemProcessor(logger), { connection }),
    new Worker(
      QUEUE_NAMES.sales,
      createSalesProcessor(
        {
          reconcilePayments: () => reconciliation.run(),
          submitDocuments: () => documents.submitPending(),
        },
        logger,
      ),
      { connection },
    ),
    new Worker(
      QUEUE_NAMES.diffusion,
      createDiffusionProcessor({
        sendCampaigns: () => campaigns.sendPending(),
        purgeLeads: () => leads.purgeUnsubscribed(),
      }),
      { connection },
    ),
    new Worker(
      QUEUE_NAMES.certificates,
      createCertificatesProcessor(
        {
          syncResults: () => certificates.syncResults(),
          sendCertificates: () => certificates.sendPending(),
          syncValidator: () => certificates.syncValidator(),
        },
        logger,
      ),
      { connection },
    ),
    new Worker(
      QUEUE_NAMES.enrollment,
      createEnrollmentProcessor(
        {
          pendingIds: () => enrollment.pendingIds(),
          process: (id) => enrollment.process(id),
          recordAttempt: (id, message) => enrollment.recordAttempt(id, message),
          markFailed: (id, message) => enrollment.markFailed(id, message),
          sendWelcomes: () => enrollment.sendWelcomes(),
          syncWithdrawals: () => enrollment.syncWithdrawals(),
          advanceWaitlists: () => waitlist.advance(),
          sendWaitlistOffers: () => waitlist.sendOffers(),
        },
        enrollmentQueue,
        logger,
      ),
      { connection },
    ),
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
    await Promise.all([
      systemQueue.close(),
      checkoutQueue.close(),
      enrollmentQueue.close(),
      certificatesQueue.close(),
      salesQueue.close(),
      diffusionQueue.close(),
    ]);
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
