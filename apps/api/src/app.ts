import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { LoggerOptions } from 'pino';
import type { Env } from './config/env.js';
import { NoCache, RedisCache, type Cache } from './infra/cache.js';
import type { Integrations } from './integrations/index.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { AdminAreasService, AdminInstructorsService } from './modules/admin/areas.service.js';
import { AuditLogService } from './modules/admin/audit-log.service.js';
import { AdminCouponsService } from './modules/admin/coupons.service.js';
import { AdminCoursesService } from './modules/admin/courses.service.js';
import { CatalogCacheInvalidator } from './modules/admin/support.js';
import { accessPlugin } from './modules/auth/access.plugin.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { mockIdpRoutes } from './modules/auth/mock-idp.routes.js';
import { RoleResolver } from './modules/auth/roles.js';
import {
  MemorySessionStore,
  RedisSessionStore,
  type SessionStore,
} from './modules/auth/session-store.js';
import { sessionPlugin } from './modules/auth/session.plugin.js';
import { PrismaUserRepository, type UserRepository } from './modules/auth/users.js';
import { PrismaCatalogRepository } from './modules/catalog/catalog.prisma-repository.js';
import type { CatalogRepository } from './modules/catalog/catalog.repository.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { certificatesRoutes } from './modules/certificates/certificates.routes.js';
import { CertificatesService } from './modules/certificates/certificates.service.js';
import { checkoutRoutes } from './modules/checkout/checkout.routes.js';
import { CheckoutService } from './modules/checkout/checkout.service.js';
import { healthRoutes, type ReadinessCheck } from './modules/health/health.routes.js';
import { MockPaymentGateway } from './integrations/payment-gateway/mock.js';
import { mockPaymentRoutes } from './modules/payments/mock-payment.routes.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { PaymentsService } from './modules/payments/payments.service.js';
import { ReceiptsService } from './modules/payments/receipts.service.js';
import { RefundsService } from './modules/payments/refunds.service.js';
import { enrollmentRoutes } from './modules/enrollment/enrollment.routes.js';
import { EnrollmentService } from './modules/enrollment/enrollment.service.js';
import { WaitlistService } from './modules/enrollment/waitlist.service.js';
import { CampaignsService } from './modules/diffusion/campaigns.service.js';
import { diffusionRoutes } from './modules/diffusion/diffusion.routes.js';
import { LeadsService } from './modules/diffusion/leads.service.js';
import { legalRoutes } from './modules/legal/legal.routes.js';
import { LegalService } from './modules/legal/legal.service.js';
import { privacyRoutes } from './modules/privacy/privacy.routes.js';
import { PrivacyService } from './modules/privacy/privacy.service.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { DOCUMENT_COLUMN_KEYS } from './config/env.js';
import { DocumentsService } from './modules/sales/documents.service.js';
import { ReconciliationService } from './modules/sales/reconciliation.service.js';
import { salesRoutes } from './modules/sales/sales.routes.js';
import { SalesService } from './modules/sales/sales.service.js';
import { seoRoutes } from './modules/seo/seo.routes.js';
import { auditPlugin, PrismaAuditRecorder, type AuditRecorder } from './plugins/audit.js';
import { errorsPlugin } from './plugins/errors.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { securityPlugin } from './plugins/security.js';
import { swaggerPlugin } from './plugins/swagger.js';

export interface AppDependencies {
  env: Env;
  integrations: Integrations;
  readinessChecks: Record<string, ReadinessCheck>;
  prisma: PrismaClient;
  /** Conexión para el rate limit y la caché compartidos entre instancias. */
  redis?: Redis;
  logger?: LoggerOptions | false;
  /** Reemplaza el acceso a datos del catálogo (pruebas unitarias). */
  catalogRepository?: CatalogRepository;
  /** Reemplaza el almacén de sesiones (pruebas unitarias). Por defecto Redis. */
  sessionStore?: SessionStore;
  /** Reemplaza el registro de usuarios al iniciar sesión (pruebas unitarias). */
  users?: UserRepository;
  /** Reemplaza la auditoría persistente (pruebas unitarias). */
  audit?: AuditRecorder;
  /** Reemplaza la caché (pruebas unitarias). Por defecto Redis si hay conexión. */
  cache?: Cache;
  /** Reloj inyectable para pruebas. */
  now?: () => Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    integrations: Integrations;
  }
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { env } = deps;

  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: env.TRUST_PROXY,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.decorate('integrations', deps.integrations);

  await app.register(errorsPlugin);
  await app.register(securityPlugin, {
    corsOrigins: env.CORS_ORIGINS ?? [env.PUBLIC_WEB_URL],
  });
  await app.register(rateLimitPlugin, {
    max: env.RATE_LIMIT_MAX,
    timeWindowMs: env.RATE_LIMIT_WINDOW_MS,
    ...(deps.redis ? { redis: deps.redis } : {}),
  });
  const cache: Cache =
    deps.cache ??
    (deps.redis
      ? new RedisCache(deps.redis, 'cache:', (error, operation) =>
          app.log.warn({ err: error, operation }, 'Cache unavailable, reading from the source'),
        )
      : new NoCache());
  const roles = new RoleResolver(deps.integrations.sga, cache, env.SGA_ROLES_CACHE_TTL_SECONDS);
  const webUrl = env.PUBLIC_WEB_URL.replace(/\/+$/, '');

  const recorder = deps.audit ?? new PrismaAuditRecorder(deps.prisma);

  await app.register(sessionPlugin, {
    store:
      deps.sessionStore ??
      (deps.redis ? new RedisSessionStore(deps.redis) : new MemorySessionStore()),
    idleTimeoutSeconds: env.SESSION_IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: env.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    secure: env.SESSION_COOKIE_SECURE,
    ...(deps.now ? { now: () => (deps.now as () => Date)().getTime() } : {}),
  });
  await app.register(auditPlugin, { recorder });
  await app.register(accessPlugin, {
    roles,
    allowedOrigins: [env.PUBLIC_WEB_URL, ...(env.CORS_ORIGINS ?? [])],
  });
  await app.register(swaggerPlugin, { version: env.APP_VERSION });

  const catalog = new CatalogService({
    repository: deps.catalogRepository ?? new PrismaCatalogRepository(deps.prisma),
    cache,
    catalogTtlSeconds: env.CATALOG_CACHE_TTL_SECONDS,
    seatsTtlSeconds: env.SEATS_CACHE_TTL_SECONDS,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const adminDeps = {
    prisma: deps.prisma,
    audit: recorder,
    invalidator: new CatalogCacheInvalidator(cache),
  };

  const legal = new LegalService(deps.prisma, recorder, deps.now);
  const checkout = new CheckoutService({
    prisma: deps.prisma,
    audit: recorder,
    legal,
    cache,
    reservationTtlMinutes: env.SEAT_RESERVATION_TTL_MINUTES,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const provider = {
    name: env.SELLER_NAME,
    rut: env.SELLER_RUT,
    address: env.SELLER_ADDRESS,
    email: env.SELLER_EMAIL,
    phone: env.SELLER_PHONE,
  };
  const gateway = deps.integrations.paymentGateway;
  const payments = new PaymentsService({
    prisma: deps.prisma,
    gateway,
    mailer: deps.integrations.mailer,
    audit: recorder,
    cache,
    logger: app.log,
    returnUrl: `${webUrl}/api/payments/return`,
    ...(env.UTA_ALERT_EMAIL ? { alertEmail: env.UTA_ALERT_EMAIL } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, {
        version: env.APP_VERSION,
        readinessChecks: deps.readinessChecks,
      });
      await api.register(catalogRoutes, { catalog });
      await api.register(authRoutes, {
        identity: deps.integrations.identity,
        roles,
        users: deps.users ?? new PrismaUserRepository(deps.prisma),
        callbackUrl: env.OIDC_REDIRECT_URI ?? `${webUrl}/api/auth/callback`,
        webUrl,
        rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
      });
      if (env.IDENTITY_DRIVER === 'mock') await api.register(mockIdpRoutes);
      await api.register(adminRoutes, {
        areas: new AdminAreasService(adminDeps),
        instructors: new AdminInstructorsService(adminDeps),
        courses: new AdminCoursesService(adminDeps),
        auditLog: new AuditLogService(deps.prisma),
        coupons: new AdminCouponsService(adminDeps),
      });
      await api.register(legalRoutes, {
        legal,
        provider,
      });
      await api.register(paymentsRoutes, {
        payments,
        receipts: new ReceiptsService({
          prisma: deps.prisma,
          mailer: deps.integrations.mailer,
          provider,
          logger: app.log,
          webUrl,
        }),
        refunds: new RefundsService({
          prisma: deps.prisma,
          gateway,
          audit: recorder,
          cache,
          checkout,
          ...(deps.now ? { now: deps.now } : {}),
        }),
        rateLimit: { max: env.CHECKOUT_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
      });
      await api.register(enrollmentRoutes, {
        enrollment: new EnrollmentService({
          prisma: deps.prisma,
          lms: deps.integrations.lms,
          mailer: deps.integrations.mailer,
          audit: recorder,
          cache,
          checkout,
          logger: app.log,
          webUrl,
          ...(deps.now ? { now: deps.now } : {}),
        }),
        waitlist: new WaitlistService({
          prisma: deps.prisma,
          mailer: deps.integrations.mailer,
          audit: recorder,
          checkout,
          logger: app.log,
          webUrl,
          offerHours: env.WAITLIST_OFFER_HOURS,
          ...(deps.now ? { now: deps.now } : {}),
        }),
        rateLimit: { max: env.CHECKOUT_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
      });
      await api.register(certificatesRoutes, {
        certificates: new CertificatesService({
          prisma: deps.prisma,
          lms: deps.integrations.lms,
          validator: deps.integrations.certificateValidator,
          mailer: deps.integrations.mailer,
          audit: recorder,
          logger: app.log,
          provider,
          webUrl,
          graceDays: env.COURSE_RESULT_GRACE_DAYS,
          ...(env.MOODLE_URL ? { lmsUrl: env.MOODLE_URL } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        }),
        verifyRateLimit: { max: env.VERIFY_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
      });
      await api.register(salesRoutes, {
        sales: new SalesService(deps.prisma),
        documents: new DocumentsService({
          prisma: deps.prisma,
          gateway: deps.integrations.invoicing,
          audit: recorder,
          logger: app.log,
          columns: env.INVOICING_EXPORT_COLUMNS ?? DOCUMENT_COLUMN_KEYS,
          vatPercent: env.VAT_RATE_PERCENT,
          ...(deps.now ? { now: deps.now } : {}),
        }),
        reconciliation: new ReconciliationService({
          prisma: deps.prisma,
          gateway,
          mailer: deps.integrations.mailer,
          audit: recorder,
          logger: app.log,
          ...(env.UTA_ALERT_EMAIL ? { alertEmail: env.UTA_ALERT_EMAIL } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        }),
      });
      await api.register(reportsRoutes, { reports: new ReportsService(deps.prisma) });
      await api.register(privacyRoutes, {
        privacy: new PrivacyService({
          prisma: deps.prisma,
          audit: recorder,
          ...(deps.now ? { now: deps.now } : {}),
        }),
      });
      await api.register(diffusionRoutes, {
        leads: new LeadsService({
          prisma: deps.prisma,
          audit: recorder,
          retentionDays: env.LEAD_RETENTION_DAYS,
          ...(deps.now ? { now: deps.now } : {}),
        }),
        campaigns: new CampaignsService({
          prisma: deps.prisma,
          mailer: deps.integrations.mailer,
          audit: recorder,
          logger: app.log,
          webUrl,
          ...(deps.now ? { now: deps.now } : {}),
        }),
        leadsRateLimit: { max: env.LEADS_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
        viewsRateLimit: {
          max: env.PAGE_VIEW_RATE_LIMIT_MAX,
          timeWindowMs: env.RATE_LIMIT_WINDOW_MS,
        },
      });
      if (gateway instanceof MockPaymentGateway) {
        await api.register(mockPaymentRoutes, { gateway });
      }
      await api.register(checkoutRoutes, {
        checkout,
        rateLimit: { max: env.CHECKOUT_RATE_LIMIT_MAX, timeWindowMs: env.RATE_LIMIT_WINDOW_MS },
      });
      await api.register(seoRoutes, {
        catalog,
        site: {
          baseUrl: webUrl,
          allowIndexing: env.SEO_ALLOW_INDEXING,
        },
        ...(deps.now ? { now: deps.now } : {}),
      });
    },
    { prefix: '/api' },
  );

  return app;
}
