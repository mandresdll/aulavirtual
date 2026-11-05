import { randomUUID } from 'node:crypto';
import {
  AdminOrderSchema,
  CSRF_HEADER,
  CurrentLegalDocumentsSchema,
  IDEMPOTENCY_HEADER,
  OrderSummarySchema,
  StartPaymentResponseSchema,
  type LegalDocument,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { IntegrationError } from '../../src/integrations/errors.js';
import { createIntegrations, type Integrations } from '../../src/integrations/index.js';
import type { MemoryMailer } from '../../src/integrations/mailer/memory.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { CheckoutService } from '../../src/modules/checkout/checkout.service.js';
import { LegalService, sha256 } from '../../src/modules/legal/legal.service.js';
import { PaymentsService } from '../../src/modules/payments/payments.service.js';
import { ReceiptsService } from '../../src/modules/payments/receipts.service.js';
import { PrismaAuditRecorder } from '../../src/plugins/audit.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/**
 * Pagos contra PostgreSQL real con la pasarela simulada (RF-03): aprobado, rechazado,
 * abandonado, doble retorno, reintento, vencimiento, monto alterado, corte de red y devoluciones.
 */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL, CHECKOUT_RATE_LIMIT_MAX: '1000' });
const run = randomUUID().slice(0, 8);
const logger = { error: () => {}, warn: () => {} };

let prisma: PrismaClient;
let app: FastifyInstance;
let integrations: Integrations;
let student: TestSession;
let admin: TestSession;
let legal: LegalDocument[];
let courseId: string;
let editionCount = 0;

function send(
  session: TestSession,
  method: 'POST' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method,
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

async function newEdition(priceClp = 50_000) {
  editionCount += 1;
  const edition = await prisma.courseEdition.create({
    data: {
      courseId,
      code: `PAY-${run}-${editionCount}`.toUpperCase(),
      startsAt: daysFromNow(30),
      endsAt: daysFromNow(60),
      enrollmentClosesAt: daysFromNow(20),
      capacity: 10,
      priceClp,
      status: 'published',
    },
  });
  return edition.id;
}

/** Crea una orden `awaiting_payment` del estudiante y devuelve su número. */
async function createOrder(options: { couponCode?: string; priceClp?: number } = {}) {
  const editionId = await newEdition(options.priceClp);
  await send(student, 'POST', '/api/cart/items', { editionId });
  const response = await send(
    student,
    'POST',
    '/api/checkout/orders',
    {
      acceptedLegal: legal.map(({ type, version }) => ({ type, version })),
      ...(options.couponCode ? { couponCode: options.couponCode } : {}),
    },
    { [IDEMPOTENCY_HEADER]: randomUUID() },
  );
  expect(response.statusCode).toBe(201);
  return { number: OrderSummarySchema.parse(response.json()).number, editionId };
}

async function startPayment(number: string, session = student) {
  const response = await send(session, 'POST', `/api/orders/${number}/pay`);
  expect(response.statusCode).toBe(200);
  const { redirectUrl } = StartPaymentResponseSchema.parse(response.json());
  return new URL(redirectUrl).searchParams.get('token') ?? '';
}

const back = (query: string) => app.inject({ url: `/api/payments/return?${query}` });

const getOrder = async (number: string) =>
  OrderSummarySchema.parse(
    (
      await app.inject({ url: `/api/orders/${number}`, headers: { cookie: student.cookie } })
    ).json(),
  );

const stored = (number: string) =>
  prisma.order.findUniqueOrThrow({
    where: { number },
    include: {
      payments: { orderBy: { createdAt: 'asc' } },
      seatReservations: true,
      items: { include: { enrollment: true } },
      coupon: true,
    },
  });

function services() {
  const audit = new PrismaAuditRecorder(prisma);
  return {
    payments: (now?: () => Date) =>
      new PaymentsService({
        prisma,
        gateway: integrations.paymentGateway,
        mailer: integrations.mailer,
        audit,
        cache: new MemoryCache(),
        logger,
        returnUrl: `${WEB_URL}/api/payments/return`,
        ...(now ? { now } : {}),
      }),
    checkout: (now: () => Date) =>
      new CheckoutService({
        prisma,
        audit,
        legal: new LegalService(prisma, audit),
        cache: new MemoryCache(),
        reservationTtlMinutes: 15,
        now,
      }),
    receipts: () =>
      new ReceiptsService({
        prisma,
        mailer: integrations.mailer,
        provider: { name: 'CFT', rut: '1-9', address: 'Punta Arenas', email: 'a@b.cl', phone: '1' },
        logger,
        webUrl: WEB_URL,
      }),
  };
}

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
  const area = await prisma.area.create({ data: { slug: `pagos-${run}`, name: 'Pagos' } });
  const course = await prisma.course.create({
    data: {
      slug: `pagos-${run}`,
      title: 'Curso de pagos',
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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Las órdenes impiden borrar el curso: se archiva para no alterar el catálogo de otras pruebas.
  await prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });
  await app.close();
  await prisma.$disconnect();
});

describe('approved payment', () => {
  it('confirms on the server, marks the order paid and creates the enrollment', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);

    const response = await back(`token_ws=${token}`);
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(`/ordenes/${number}?pago=aprobado`);

    const order = await stored(number);
    expect(order).toMatchObject({ status: 'paid' });
    expect(order.paidAt).not.toBeNull();
    expect(order.payments[0]).toMatchObject({
      status: 'authorized',
      amountClp: 50_000,
      authorizationCode: '1213',
      cardLast4: '6623',
    });
    expect(order.seatReservations.map((item) => item.status)).toEqual(['consumed']);
    expect(order.items[0]?.enrollment).toMatchObject({
      source: 'purchase',
      status: 'pending_lms',
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'payment.authorized', entityId: order.payments[0]?.id ?? '' },
      }),
    ).toBe(1);
    expect((await getOrder(number)).payment).toMatchObject({
      status: 'authorized',
      cardLast4: '6623',
    });
  });

  it('downloads the receipt and emails it exactly once', async () => {
    const { number } = await createOrder();
    await back(`token_ws=${await startPayment(number)}`);

    const pdf = await app.inject({
      url: `/api/orders/${number}/receipt`,
      headers: { cookie: student.cookie },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const mailer = integrations.mailer as MemoryMailer;
    const receipts = services().receipts();
    expect(await receipts.sendPending()).toBeGreaterThanOrEqual(1);
    const email = mailer.sent.find((message) => message.subject.includes(number));
    expect(email?.to).toBe('estudiante@example.com');
    expect(email?.attachments?.[0]).toMatchObject({
      filename: `comprobante-${number}.pdf`,
      contentType: 'application/pdf',
    });
    expect((await stored(number)).receiptSentAt).not.toBeNull();
    expect(await receipts.sendPending()).toBe(0);
  });

  it('keeps the payment valid when the email fails and retries later', async () => {
    const { number } = await createOrder();
    await back(`token_ws=${await startPayment(number)}`);
    const receipts = services().receipts();

    const spy = vi.spyOn(integrations.mailer, 'send').mockRejectedValue(new Error('SMTP down'));
    expect(await receipts.sendPending()).toBe(0);
    expect((await stored(number)).status).toBe('paid');
    expect((await stored(number)).receiptSentAt).toBeNull();

    spy.mockRestore();
    expect(await receipts.sendPending()).toBeGreaterThanOrEqual(1);
  });

  it('does not give the receipt of an unpaid order or of another person', async () => {
    const { number } = await createOrder();
    const unpaid = await app.inject({
      url: `/api/orders/${number}/receipt`,
      headers: { cookie: student.cookie },
    });
    expect(unpaid.statusCode).toBe(409);
    const foreign = await send(admin, 'POST', `/api/orders/${number}/pay`);
    expect(foreign.statusCode).toBe(404);
  });
});

describe('browser double return', () => {
  it('commits once and shows the same result again', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);
    const commit = vi.spyOn(integrations.paymentGateway, 'commit');

    await back(`token_ws=${token}`);
    const second = await back(`token_ws=${token}`);
    expect(second.headers.location).toBe(`/ordenes/${number}?pago=aprobado`);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('commits once with two simultaneous returns', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);
    const commit = vi.spyOn(integrations.paymentGateway, 'commit');

    const results = await Promise.all([back(`token_ws=${token}`), back(`token_ws=${token}`)]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.statusCode)).toEqual([303, 303]);
    expect((await stored(number)).status).toBe('paid');
    expect((await stored(number)).items[0]?.enrollment).not.toBeNull();
  });

  it('cannot pay an order that is already paid', async () => {
    const { number } = await createOrder();
    await back(`token_ws=${await startPayment(number)}`);
    const again = await send(student, 'POST', `/api/orders/${number}/pay`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ORDER_ALREADY_PAID');
  });
});

describe('rejected, abandoned and retried payments', () => {
  const reject = (token: string) => {
    (integrations.paymentGateway as unknown as { simulate(t: string, o: string): void }).simulate(
      token,
      'rejected',
    );
  };

  it('lets the buyer retry a rejected payment on the same order', async () => {
    const { number } = await createOrder();
    const first = await startPayment(number);
    reject(first);
    const response = await back(`token_ws=${first}`);
    expect(response.headers.location).toBe(`/ordenes/${number}?pago=rechazado`);
    expect(await getOrder(number)).toMatchObject({
      status: 'awaiting_payment',
      paymentAttemptsLeft: 2,
      payment: { status: 'rejected' },
    });

    const second = await startPayment(number);
    expect(second).not.toBe(first);
    expect((await back(`token_ws=${second}`)).headers.location).toContain('pago=aprobado');
    const order = await stored(number);
    expect(order.status).toBe('paid');
    expect(order.payments.map((item) => item.status)).toEqual(['rejected', 'authorized']);
    expect(order.payments.map((item) => item.buyOrder)).toEqual([`${number}-1`, `${number}-2`]);
  });

  it('records an abandoned payment from every Webpay return format', async () => {
    const { number } = await createOrder();
    const cancelled = await startPayment(number);
    const response = await back(`TBK_TOKEN=${cancelled}&TBK_ORDEN_COMPRA=${number}-1`);
    expect(response.headers.location).toBe(`/ordenes/${number}?pago=abandonado`);

    // Tiempo agotado en el formulario: Webpay no envía token, solo la orden de compra.
    await startPayment(number);
    const timeout = await back(`TBK_ORDEN_COMPRA=${number}-2&TBK_ID_SESION=sesion`);
    expect(timeout.headers.location).toBe(`/ordenes/${number}?pago=abandonado`);

    expect((await stored(number)).payments.map((item) => item.status)).toEqual([
      'aborted',
      'aborted',
    ]);
    expect((await getOrder(number)).paymentAttemptsLeft).toBe(1);
  });

  it('accepts the return by POST with a form', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);
    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/return',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `token_ws=${token}`,
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toContain('pago=aprobado');
  });

  it('closes the order after 3 failed attempts and gives back seats and coupon use', async () => {
    const couponCode = `PAGO-${run}`.toUpperCase();
    await prisma.coupon.create({ data: { code: couponCode, type: 'percentage', value: 10 } });
    const { number } = await createOrder({ couponCode });
    expect((await stored(number)).coupon?.usesCount).toBe(1);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = await startPayment(number);
      reject(token);
      await back(`token_ws=${token}`);
    }
    const order = await stored(number);
    expect(order.status).toBe('failed');
    expect(order.seatReservations.map((item) => item.status)).toEqual(['released']);
    expect(order.coupon?.usesCount).toBe(0);

    const again = await send(student, 'POST', `/api/orders/${number}/pay`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ORDER_NOT_PAYABLE');
  });

  it('ignores an unknown token without touching anything', async () => {
    expect((await back('token_ws=desconocido')).headers.location).toBe('/?pago=error');
  });
});

describe('payment against expiry', () => {
  it('does not charge an order whose time ran out', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);
    await prisma.order.update({
      where: { number },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const commit = vi.spyOn(integrations.paymentGateway, 'commit');

    const response = await back(`token_ws=${token}`);
    expect(response.headers.location).toBe(`/ordenes/${number}?pago=vencido`);
    expect(commit).not.toHaveBeenCalled();
    expect((await stored(number)).payments[0]?.status).toBe('aborted');
  });

  it('does not expire an order while its payment is being confirmed', async () => {
    const { number } = await createOrder();
    await startPayment(number);
    const order = await stored(number);
    await prisma.payment.update({
      where: { id: order.payments[0]?.id ?? '' },
      data: { status: 'confirming' },
    });

    const later = new Date(Date.now() + 16 * 60_000);
    await services()
      .checkout(() => later)
      .expireStaleOrders();
    expect((await stored(number)).status).toBe('awaiting_payment');
  });
});

describe('gateway problems', () => {
  it('reverses a charge whose amount does not match the order', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);
    const gateway = integrations.paymentGateway;
    const realCommit = gateway.commit.bind(gateway);
    vi.spyOn(gateway, 'commit').mockImplementation(async (value) => ({
      ...(await realCommit(value)),
      amount: 1_000,
    }));
    const refund = vi.spyOn(gateway, 'refund').mockResolvedValue({
      type: 'reversed',
      amount: 1_000,
      raw: {},
    });

    const response = await back(`token_ws=${token}`);
    expect(response.headers.location).toBe(`/ordenes/${number}?pago=error`);
    expect(refund).toHaveBeenCalledWith({ token, amount: 1_000 });
    const order = await stored(number);
    expect(order.status).toBe('awaiting_payment');
    expect(order.payments[0]?.status).toBe('failed');
    expect(order.items[0]?.enrollment).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { action: 'payment.reversed', entityId: order.payments[0]?.id ?? '' },
      }),
    ).toBe(1);
  });

  it('answers 503 when the gateway is down and allows starting again', async () => {
    const { number } = await createOrder();
    const spy = vi
      .spyOn(integrations.paymentGateway, 'createTransaction')
      .mockRejectedValueOnce(new IntegrationError('payment-gateway', 'DOWN', 'down', true));
    const response = await send(student, 'POST', `/api/orders/${number}/pay`);
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('GATEWAY_UNAVAILABLE');
    spy.mockRestore();

    const token = await startPayment(number);
    expect(token).not.toBe('');
    expect((await getOrder(number)).paymentAttemptsLeft).toBe(3);
  });

  it('recovers a confirmation cut by a network failure', async () => {
    const { number } = await createOrder();
    const token = await startPayment(number);
    const gateway = integrations.paymentGateway;
    const down = new IntegrationError('payment-gateway', 'DOWN', 'down', true);

    // El commit se concreta en la pasarela, pero la respuesta nunca llega.
    const realCommit = gateway.commit.bind(gateway);
    const commit = vi.spyOn(gateway, 'commit').mockImplementation(async (value) => {
      await realCommit(value);
      throw down;
    });
    const status = vi.spyOn(gateway, 'getStatus').mockRejectedValueOnce(down);

    const response = await back(`token_ws=${token}`);
    expect(response.headers.location).toBe(`/ordenes/${number}?pago=procesando`);
    expect((await stored(number)).payments[0]?.status).toBe('confirming');
    commit.mockRestore();
    status.mockRestore();

    const later = new Date(Date.now() + 3 * 60_000);
    expect(
      await services()
        .payments(() => later)
        .recoverConfirmations(),
    ).toBeGreaterThanOrEqual(1);
    expect((await stored(number)).status).toBe('paid');
  });
});

describe('refunds', () => {
  const refund = (number: string, amountClp: number, key = randomUUID()) =>
    send(
      admin,
      'POST',
      `/api/admin/orders/${number}/refunds`,
      { amountClp, reason: 'Solicitud del comprador' },
      { [IDEMPOTENCY_HEADER]: key },
    );

  async function paidOrder() {
    const order = await createOrder();
    await back(`token_ws=${await startPayment(order.number)}`);
    return order;
  }

  it('shows the order with payments and history to finance staff', async () => {
    const { number } = await paidOrder();
    const response = await app.inject({
      url: `/api/admin/orders/${number}`,
      headers: { cookie: admin.cookie },
    });
    const order = AdminOrderSchema.parse(response.json());
    expect(order).toMatchObject({
      buyer: { email: 'estudiante@example.com' },
      refundableClp: 50_000,
    });
    expect(order.history.map((item) => item.toStatus)).toEqual([
      'pending',
      'awaiting_payment',
      'paid',
    ]);
  });

  it('refunds partially, then the rest, and only then frees the seat', async () => {
    const { number, editionId } = await paidOrder();
    const seats = () =>
      prisma.enrollment.count({ where: { editionId, status: { not: 'withdrawn' } } });

    const partial = await refund(number, 20_000);
    expect(partial.statusCode).toBe(200);
    expect(partial.json()).toMatchObject({ status: 'partially_refunded', refundableClp: 30_000 });
    expect(await seats()).toBe(1);

    const tooMuch = await refund(number, 40_000);
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json().error.code).toBe('REFUND_EXCEEDS_PAYMENT');

    const rest = await refund(number, 30_000);
    expect(rest.json()).toMatchObject({ status: 'refunded', refundableClp: 0 });
    expect(await seats()).toBe(0);
    const order = await stored(number);
    expect(order.payments[0]?.status).toBe('refunded');
    expect(order.items[0]?.enrollment).toMatchObject({ status: 'withdrawn' });
    expect(await prisma.auditLog.count({ where: { action: 'refund.completed' } })).toBeGreaterThan(
      1,
    );
  });

  it('does not refund twice with the same key', async () => {
    const { number } = await paidOrder();
    const key = randomUUID();
    const spy = vi.spyOn(integrations.paymentGateway, 'refund');
    await refund(number, 10_000, key);
    const again = await refund(number, 10_000, key);
    expect(again.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(again.json().refundableClp).toBe(40_000);
  });

  it('restores the order when the gateway rejects the refund', async () => {
    const { number } = await paidOrder();
    vi.spyOn(integrations.paymentGateway, 'refund').mockRejectedValueOnce(
      new IntegrationError('payment-gateway', 'REFUND_FAILED', 'no'),
    );
    const response = await refund(number, 10_000);
    expect(response.statusCode).toBe(502);
    expect((await stored(number)).status).toBe('paid');
    expect((await refund(number, 50_000)).json().status).toBe('refunded');
  });

  it('rejects refunds of unpaid orders', async () => {
    const { number } = await createOrder();
    expect((await refund(number, 1_000)).statusCode).toBe(409);
  });
});
