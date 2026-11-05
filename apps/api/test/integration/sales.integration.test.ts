import { randomUUID } from 'node:crypto';
import {
  AdminCampaignSchema,
  AdminCampaignsResponseSchema,
  AdminLeadsResponseSchema,
  CSRF_HEADER,
  CurrentLegalDocumentsSchema,
  DocumentsResponseSchema,
  IDEMPOTENCY_HEADER,
  LEAD_CONSENT,
  OrderSummarySchema,
  ReconciliationResponseSchema,
  ReportSchema,
  SalesResponseSchema,
  StartPaymentResponseSchema,
  toLocalIsoDate,
  type LegalDocument,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { IntegrationError } from '../../src/integrations/errors.js';
import { createIntegrations, type Integrations } from '../../src/integrations/index.js';
import { ExportInvoicingGateway } from '../../src/integrations/invoicing/export.js';
import { MockInvoicingGateway } from '../../src/integrations/invoicing/mock.js';
import type { InvoicingGateway } from '../../src/integrations/invoicing/port.js';
import type { MemoryMailer } from '../../src/integrations/mailer/memory.js';
import type { PaymentGateway } from '../../src/integrations/payment-gateway/port.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { CampaignsService } from '../../src/modules/diffusion/campaigns.service.js';
import { sha256 } from '../../src/modules/legal/legal.service.js';
import { DocumentsService } from '../../src/modules/sales/documents.service.js';
import { ReconciliationService } from '../../src/modules/sales/reconciliation.service.js';
import { PrismaAuditRecorder } from '../../src/plugins/audit.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/** Ventas, documentos, conciliación, reportes y difusión contra PostgreSQL real (RF-02/08/09). */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({
  PUBLIC_WEB_URL: WEB_URL,
  CHECKOUT_RATE_LIMIT_MAX: '1000',
  LEADS_RATE_LIMIT_MAX: '1000',
  PAGE_VIEW_RATE_LIMIT_MAX: '1000',
});
const run = randomUUID().slice(0, 8);
const logger = { warn: () => {} };
const actor = { actorId: null, actorRole: null };
const today = toLocalIsoDate(new Date());

let prisma: PrismaClient;
let app: FastifyInstance;
let integrations: Integrations;
let student: TestSession;
let admin: TestSession;
let legal: LegalDocument[];
let courseId: string;
let courseSlug: string;
let editionCount = 0;

function send(
  session: TestSession,
  url: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: session.cookie,
      [CSRF_HEADER]: session.csrfToken,
      origin: WEB_URL,
      ...headers,
    },
    ...(payload === undefined ? {} : { payload }),
  });
}

const get = (url: string, session = admin) =>
  app.inject({ url, headers: { cookie: session.cookie } });

const lead = (email: string, extra: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/leads',
    payload: {
      email,
      courseSlug,
      consent: true,
      consentVersion: LEAD_CONSENT.version,
      ...extra,
    },
  });

async function paidOrder(priceClp = 50_000, utm?: Record<string, string>) {
  editionCount += 1;
  const edition = await prisma.courseEdition.create({
    data: {
      courseId,
      code: `SAL-${run}-${editionCount}`.toUpperCase(),
      startsAt: daysFromNow(30),
      endsAt: daysFromNow(60),
      enrollmentClosesAt: daysFromNow(20),
      capacity: 10,
      priceClp,
      status: 'published',
    },
  });
  await send(student, '/api/cart/items', { editionId: edition.id });
  const created = await send(
    student,
    '/api/checkout/orders',
    {
      acceptedLegal: legal.map(({ type, version }) => ({ type, version })),
      ...(utm ? { utm } : {}),
    },
    { [IDEMPOTENCY_HEADER]: randomUUID() },
  );
  expect(created.statusCode).toBe(201);
  const { number } = OrderSummarySchema.parse(created.json());
  const started = await send(student, `/api/orders/${number}/pay`);
  const { redirectUrl } = StartPaymentResponseSchema.parse(started.json());
  const token = new URL(redirectUrl).searchParams.get('token') ?? '';
  await app.inject({ url: `/api/payments/return?token_ws=${token}` });
  return { number, token, editionId: edition.id };
}

const documentOf = (number: string) =>
  prisma.salesDocument.findFirstOrThrow({ where: { order: { number } } });

const documents = (gateway: InvoicingGateway) =>
  new DocumentsService({
    prisma,
    gateway,
    audit: new PrismaAuditRecorder(prisma),
    logger,
    columns: ['orden', 'total', 'estado'],
    vatPercent: 19,
  });

const reconciliation = (gateway: PaymentGateway) =>
  new ReconciliationService({
    prisma,
    gateway,
    mailer: integrations.mailer,
    audit: new PrismaAuditRecorder(prisma),
    logger,
    alertEmail: 'alertas@example.cl',
  });

const campaigns = () =>
  new CampaignsService({
    prisma,
    mailer: integrations.mailer,
    audit: new PrismaAuditRecorder(prisma),
    logger,
    webUrl: WEB_URL,
  });

const mails = () => (integrations.mailer as MemoryMailer).sent;

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);
  for (const type of ['terms', 'privacy', 'withdrawal', 'refunds'] as const) {
    if (!(await prisma.legalDocument.count({ where: { type, version: 'it-base' } }))) {
      const content = `Texto de prueba (${type}).`;
      await prisma.legalDocument.create({
        data: {
          type,
          version: 'it-base',
          title: `Prueba ${type}`,
          content,
          contentSha256: sha256(content),
          effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        },
      });
    }
  }
  const area = await prisma.area.create({ data: { slug: `ventas-${run}`, name: 'Ventas' } });
  courseSlug = `ventas-${run}`;
  const course = await prisma.course.create({
    data: {
      slug: courseSlug,
      title: `Curso de ventas ${run}`,
      summary: 'Resumen',
      description: 'Descripción',
      modality: 'online',
      durationHours: 10,
      areaId: area.id,
      status: 'published',
    },
  });
  courseId = course.id;

  integrations = createIntegrations(env);
  app = await buildApp({
    env,
    integrations,
    readinessChecks: {},
    prisma,
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
  });
  student = await loginAs(app, 'mock-student');
  admin = await loginAs(app, 'mock-admin');
  legal = CurrentLegalDocumentsSchema.parse((await app.inject('/api/legal')).json()).items;
});

afterAll(async () => {
  // Las órdenes impiden borrar el curso: se archiva para no alterar el catálogo de otras pruebas.
  await prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });
  await app.close();
  await prisma.$disconnect();
});

describe('leads', () => {
  it('stores the text the person accepted, never one sent by the browser', async () => {
    const email = `ana-${run}@example.cl`;
    const response = await lead(email, {
      consentText: 'Otro texto',
      utm: { source: 'facebook', campaign: 'c1' },
    });
    expect(response.statusCode).toBe(204);
    const stored = await prisma.lead.findFirstOrThrow({ where: { email } });
    expect(stored).toMatchObject({
      courseId,
      consentText: LEAD_CONSENT.text,
      consentVersion: LEAD_CONSENT.version,
      utmSource: 'facebook',
      status: 'active',
    });
  });

  it('rejects a form without consent or with an outdated text', async () => {
    const without = await lead(`no-${run}@example.cl`, { consent: false });
    expect(without.statusCode).toBe(400);
    const outdated = await lead(`old-${run}@example.cl`, { consentVersion: 'vieja' });
    expect(outdated.statusCode).toBe(409);
    expect(
      await prisma.lead.count({ where: { email: { contains: run, startsWith: 'no-' } } }),
    ).toBe(0);
  });

  it('unsubscribes every record of the email in one click, and allows repeating it', async () => {
    const email = `baja-${run}@example.cl`;
    await lead(email);
    await lead(email, { courseSlug: undefined });
    const { unsubscribeToken } = await prisma.lead.findFirstOrThrow({ where: { email } });

    // Tal como lo envía un cliente de correo (RFC 8058): formulario y sin sesión.
    const request = {
      method: 'POST' as const,
      url: `/api/leads/unsubscribe/${unsubscribeToken}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    };
    expect((await app.inject(request)).statusCode).toBe(204);
    expect((await app.inject(request)).statusCode).toBe(204);
    expect(await prisma.lead.count({ where: { email, status: 'active' } })).toBe(0);
    expect(await prisma.lead.count({ where: { email } })).toBe(2);
  });

  it('subscribing again renews the consent', async () => {
    const email = `vuelve-${run}@example.cl`;
    await lead(email);
    const { unsubscribeToken } = await prisma.lead.findFirstOrThrow({ where: { email } });
    await app.inject({ method: 'POST', url: `/api/leads/unsubscribe/${unsubscribeToken}` });
    await lead(email);
    expect(await prisma.lead.findMany({ where: { email } })).toMatchObject([
      { status: 'active', unsubscribedAt: null },
    ]);
  });

  it('answers 404 to an unknown unsubscribe token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/leads/unsubscribe/${'0'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('lists leads in the panel only with permission', async () => {
    const listed = await get(`/api/admin/leads?q=ana-${run}`);
    expect(AdminLeadsResponseSchema.parse(listed.json()).items).toHaveLength(1);
    expect((await get('/api/admin/leads', student)).statusCode).toBe(403);
  });
});

describe('campaigns', () => {
  it('sends once per email, with the unsubscribe headers, and skips later unsubscribes', async () => {
    const stays = `recibe-${run}@example.cl`;
    const leaves = `seva-${run}@example.cl`;
    await lead(stays);
    await lead(stays, { courseSlug: undefined });
    await lead(leaves);

    const created = await send(admin, '/api/admin/campaigns', {
      subject: `Novedades ${run}`,
      body: 'Nuevos cursos disponibles.',
    });
    expect(created.statusCode).toBe(201);
    const { id } = AdminCampaignSchema.parse(created.json());
    const sent = await send(admin, `/api/admin/campaigns/${id}/send`);
    expect(sent.statusCode).toBe(200);
    expect((await send(admin, `/api/admin/campaigns/${id}/send`)).statusCode).toBe(409);

    const { unsubscribeToken } = await prisma.lead.findFirstOrThrow({ where: { email: leaves } });
    await app.inject({ method: 'POST', url: `/api/leads/unsubscribe/${unsubscribeToken}` });

    const before = mails().length;
    await campaigns().sendPending();
    const delivered = mails()
      .slice(before)
      .filter((mail) => mail.subject === `Novedades ${run}`);
    expect(delivered.filter((mail) => mail.to === stays)).toHaveLength(1);
    expect(delivered.filter((mail) => mail.to === leaves)).toHaveLength(0);
    const mail = delivered.find((item) => item.to === stays);
    expect(mail?.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(mail?.headers?.['List-Unsubscribe']).toContain(`${WEB_URL}/api/leads/unsubscribe/`);
    expect(mail?.text).toContain(`${WEB_URL}/baja/`);

    const list = AdminCampaignsResponseSchema.parse((await get('/api/admin/campaigns')).json());
    const campaign = list.items.find((item) => item.id === id);
    expect(campaign?.status).toBe('sent');
    expect(campaign?.failed).toBe(1);
  });

  it('does not send without an audience', async () => {
    await prisma.lead.updateMany({ data: { status: 'unsubscribed' } });
    const created = await send(admin, '/api/admin/campaigns', {
      subject: 'Sin audiencia',
      body: 'Nadie debería recibir esto.',
    });
    const { id } = AdminCampaignSchema.parse(created.json());
    const response = await send(admin, `/api/admin/campaigns/${id}/send`);
    expect(response.statusCode).toBe(409);
  });
});

describe('sales', () => {
  it('filters sales, and the buyer who was a lead keeps the campaign', async () => {
    await prisma.lead.create({
      data: {
        email: 'estudiante@example.com',
        consentText: LEAD_CONSENT.text,
        consentVersion: LEAD_CONSENT.version,
        consentedAt: new Date(),
        unsubscribeToken: randomUUID().replaceAll('-', '').repeat(2),
        utmCampaign: `lead-${run}`,
      },
    });
    const { number } = await paidOrder();
    const response = await get(`/api/admin/sales?q=${number}`);
    const [sale] = SalesResponseSchema.parse(response.json()).items;
    expect(sale).toMatchObject({
      number,
      status: 'paid',
      buyerEmail: 'estudiante@example.com',
      totalClp: 50_000,
      documentStatus: 'pending',
      utmCampaign: `lead-${run}`,
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order.leadId).not.toBeNull();
  });

  it('prefers the UTM of the visit over the one of the lead', async () => {
    const { number } = await paidOrder(50_000, { source: 'correo', campaign: `visita-${run}` });
    const order = await prisma.order.findUniqueOrThrow({ where: { number } });
    expect(order.utmCampaign).toBe(`visita-${run}`);
  });

  it('exports what the filter shows', async () => {
    const { number } = await paidOrder();
    const csv = await get(`/api/admin/sales/export?format=csv&q=${number}`);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain(number);
    expect(csv.body.trim().split('\r\n')).toHaveLength(2);
    const xlsx = await get(`/api/admin/sales/export?format=xlsx&q=${number}`);
    expect(xlsx.headers['content-disposition']).toContain('ventas.xlsx');
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('keeps sales away from roles without permission', async () => {
    expect((await get('/api/admin/sales', student)).statusCode).toBe(403);
  });
});

describe('documents', () => {
  it('sends pending documents to the issuing system and keeps the folio', async () => {
    const { number } = await paidOrder();
    const service = documents(new MockInvoicingGateway());
    for (let i = 0; i < 20 && (await documentOf(number)).status === 'pending'; i++) {
      await service.submitPending();
    }
    expect(await documentOf(number)).toMatchObject({ status: 'issued', lastError: null });
    expect((await documentOf(number)).externalFolio).toBeTruthy();
  });

  it('keeps retrying when the system is down, and stops on a rejection', async () => {
    const { number } = await paidOrder();
    const fails = (retryable: boolean): InvoicingGateway => ({
      provider: 'stub',
      deliversByFile: false,
      submit: vi.fn(async (input) => {
        const document = await documentOf(number);
        if (input.orderId === document.orderId) {
          throw new IntegrationError('invoicing', 'X', 'Falló', retryable);
        }
        return { status: 'pending' as const };
      }),
      getStatus: vi.fn(async () => ({ status: 'pending' as const })),
    });
    for (let i = 0; i < 20 && !(await documentOf(number)).lastError; i++) {
      await documents(fails(true)).submitPending();
    }
    expect(await documentOf(number)).toMatchObject({ status: 'pending', lastError: 'Falló' });

    for (let i = 0; i < 20 && (await documentOf(number)).status === 'pending'; i++) {
      await documents(fails(false)).submitPending();
    }
    const failed = await documentOf(number);
    expect(failed.status).toBe('failed');

    const retried = await send(admin, `/api/admin/documents/${failed.id}/retry`);
    expect(retried.statusCode).toBe(200);
    expect((await documentOf(number)).status).toBe('pending');
    expect((await send(admin, `/api/admin/documents/${failed.id}/retry`)).statusCode).toBe(409);
  });

  it('exports by file, marks the documents and accepts the folio by hand', async () => {
    const { number } = await paidOrder();
    const service = documents(new ExportInvoicingGateway());
    expect(await service.submitPending()).toBe(0);

    const table = await service.exportFile({ format: 'csv', from: today, to: today }, actor);
    const row = table.rows.find((item) => item[0] === number);
    expect(row).toEqual([number, 50_000, 'Pendiente']);
    expect(await documentOf(number)).toMatchObject({ status: 'exported' });
    expect((await documentOf(number)).exportedAt).not.toBeNull();

    const { id } = await documentOf(number);
    const updated = await send(admin, `/api/admin/documents/${id}/folio`, { folio: '1234' });
    expect(updated.statusCode).toBe(200);
    expect(await documentOf(number)).toMatchObject({ status: 'issued', externalFolio: '1234' });
    expect(await prisma.auditLog.count({ where: { action: 'document.folio', entityId: id } })).toBe(
      1,
    );
  });

  it('downloads the accounting file from the panel', async () => {
    const response = await send(admin, '/api/admin/documents/export', {
      format: 'csv',
      from: today,
      to: today,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Neto');
    const list = await get(`/api/admin/documents?from=${today}&to=${today}`);
    expect(DocumentsResponseSchema.parse(list.json()).items.length).toBeGreaterThan(0);
  });
});

describe('reconciliation', () => {
  const stub = (
    token: string,
    details: Partial<Awaited<ReturnType<PaymentGateway['getStatus']>>>,
  ): PaymentGateway => {
    const real = integrations.paymentGateway;
    return {
      ...real,
      provider: real.provider,
      createTransaction: real.createTransaction.bind(real),
      commit: real.commit.bind(real),
      refund: real.refund.bind(real),
      getStatus: async (asked) => {
        const status = await real.getStatus(asked);
        return asked === token ? { ...status, ...details } : status;
      },
    };
  };

  it('finds nothing when the gateway agrees, including after a partial refund', async () => {
    const { number } = await paidOrder();
    const refund = await send(
      admin,
      `/api/admin/orders/${number}/refunds`,
      { amountClp: 10_000, reason: 'Solicitud del comprador' },
      { [IDEMPOTENCY_HEADER]: randomUUID() },
    );
    expect(refund.statusCode).toBe(200);
    await reconciliation(integrations.paymentGateway).run(today);
    const { items } = ReconciliationResponseSchema.parse(
      (await get('/api/admin/reconciliation')).json(),
    );
    expect(items.filter((item) => item.orderNumber === number)).toEqual([]);
  });

  it('marks a difference once, alerts, never touches the payment, and a person resolves it', async () => {
    const { number, token } = await paidOrder();
    const service = reconciliation(stub(token, { status: 'reversed', amount: 40_000 }));
    const before = mails().length;
    await service.run(today);
    const second = await service.run(today);
    expect(second.discrepancies).toBe(0);
    expect(mails().slice(before)[0]).toMatchObject({ to: 'alertas@example.cl' });
    expect(mails().slice(before)[0]?.text).not.toContain('estudiante@example.com');

    const overview = await get('/api/admin/reconciliation');
    const found = ReconciliationResponseSchema.parse(overview.json()).items.filter(
      (item) => item.orderNumber === number,
    );
    expect(found.map((item) => item.kind).sort()).toEqual(['amount_mismatch', 'status_mismatch']);
    const payment = await prisma.payment.findFirstOrThrow({ where: { token } });
    expect(payment.status).toBe('authorized');

    for (const item of found) {
      const resolved = await send(admin, `/api/admin/reconciliation/${item.id}/resolve`, {
        note: 'Revisado con Transbank',
      });
      expect(resolved.statusCode).toBe(204);
    }
    const after = ReconciliationResponseSchema.parse(
      (await get('/api/admin/reconciliation')).json(),
    );
    expect(after.items.filter((item) => item.orderNumber === number)).toEqual([]);
    expect(
      (
        await send(admin, `/api/admin/reconciliation/${found[0]?.id ?? ''}/resolve`, {
          note: 'Otra vez',
        })
      ).statusCode,
    ).toBe(404);
  });

  it('counts apart the transactions the gateway could not answer', async () => {
    const { token } = await paidOrder();
    const real = integrations.paymentGateway;
    const down = stub(token, {});
    down.getStatus = async (asked) => {
      if (asked === token) throw new IntegrationError('payment-gateway', 'DOWN', 'Caída', true);
      return real.getStatus(asked);
    };
    const result = await reconciliation(down).run(today);
    expect(result.failed).toBeGreaterThanOrEqual(1);
  });

  it('runs from the panel', async () => {
    const response = await send(admin, '/api/admin/reconciliation', { day: '2020-01-01' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ day: '2020-01-01', checked: 0 });
  });
});

describe('reports', () => {
  const report = async (query: string, session = admin) => {
    const response = await get(`/api/admin/reports?from=${today}&to=${today}&${query}`, session);
    return ReportSchema.parse(response.json());
  };

  it('sums income net of discounts and refunds for one edition', async () => {
    const { number, editionId } = await paidOrder(30_000);
    await send(
      admin,
      `/api/admin/orders/${number}/refunds`,
      { amountClp: 5_000, reason: 'Solicitud del comprador' },
      { [IDEMPOTENCY_HEADER]: randomUUID() },
    );
    const { totals } = await report(`editionId=${editionId}`);
    expect(totals).toMatchObject({
      orders: 1,
      grossClp: 30_000,
      refundsClp: 5_000,
      netClp: 25_000,
      paidEnrollments: 1,
      freeEnrollments: 0,
    });
  });

  it('groups by course and follows a campaign along the funnel', async () => {
    const campaign = `embudo-${run}`;
    const utm = { source: 'facebook', medium: 'social', campaign };
    for (let i = 0; i < 2; i++) {
      await app.inject({
        method: 'POST',
        url: `/api/courses/${courseSlug}/views`,
        payload: { utm },
      });
    }
    await app.inject({
      method: 'POST',
      url: `/api/courses/${courseSlug}/views`,
      payload: {},
    });
    await lead(`embudo-${run}@example.cl`, { utm });
    await paidOrder(20_000, utm);

    const { rows, conversion } = await report(`courseId=${courseId}&groupBy=course`);
    expect(rows.map((row) => row.key)).toEqual([courseId]);
    expect(conversion.find((row) => row.campaign === campaign)).toEqual({
      ...utm,
      views: 2,
      leads: 1,
      orders: 1,
      paid: 1,
    });
    expect(
      conversion.find((row) => row.source === '' && row.campaign === '')?.views,
    ).toBeGreaterThanOrEqual(1);
  });

  it('ignores a view of an unknown course', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/courses/no-existe/views',
      payload: {},
    });
    expect(response.statusCode).toBe(204);
  });

  it('downloads both tables, and rejects an inverted period', async () => {
    const period = `from=${today}&to=${today}`;
    const summary = await get(`/api/admin/reports/export?${period}&format=csv`);
    expect(summary.body).toContain('Netos');
    const conversion = await get(`/api/admin/reports/export?${period}&format=csv&table=conversion`);
    expect(conversion.body).toContain('Interesados');
    const inverted = await get('/api/admin/reports?from=2026-02-01&to=2026-01-01');
    expect(inverted.statusCode).toBe(400);
  });

  it('is open to the reports role and closed to students', async () => {
    const finance = await loginAs(app, 'mock-finance');
    expect((await get(`/api/admin/reports?from=${today}&to=${today}`, finance)).statusCode).toBe(
      200,
    );
    expect((await get(`/api/admin/reports?from=${today}&to=${today}`, student)).statusCode).toBe(
      403,
    );
  });
});
