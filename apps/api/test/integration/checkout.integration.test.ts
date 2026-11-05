import { randomUUID } from 'node:crypto';
import {
  CartResponseSchema,
  CSRF_HEADER,
  CurrentLegalDocumentsSchema,
  IDEMPOTENCY_HEADER,
  OrderSummarySchema,
  QuoteSchema,
  type LegalDocument,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { CheckoutService } from '../../src/modules/checkout/checkout.service.js';
import { LegalService, sha256 } from '../../src/modules/legal/legal.service.js';
import { PrismaAuditRecorder } from '../../src/plugins/audit.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/**
 * Carrito, cupones, textos legales y checkout contra PostgreSQL real (RF-03, RF-04, RF-11).
 * Las órdenes no se pueden borrar (trigger): cada ejecución usa slugs y códigos propios.
 */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL, SEAT_RESERVATION_TTL_MINUTES: '15' });
const run = randomUUID().slice(0, 8);
const code = (name: string) => `${name}-${run}`.toUpperCase();

let prisma: PrismaClient;
let app: FastifyInstance;
let student: TestSession;
let teacher: TestSession;
let admin: TestSession;
let legal: LegalDocument[];
const ids = { course: '', open: '', closed: '', scarce: '', other: '' };

function send(
  session: TestSession,
  method: 'POST' | 'PUT' | 'DELETE',
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

const accepted = () => legal.map(({ type, version }) => ({ type, version }));

async function order(
  session: TestSession,
  payload: Record<string, unknown> = {},
  key = randomUUID(),
) {
  return send(
    session,
    'POST',
    '/api/checkout/orders',
    { acceptedLegal: accepted(), ...payload },
    { [IDEMPOTENCY_HEADER]: key },
  );
}

async function emptyCart(session: TestSession) {
  const cart = CartResponseSchema.parse(
    (await app.inject({ url: '/api/cart', headers: { cookie: session.cookie } })).json(),
  );
  for (const item of cart.items) {
    await send(session, 'DELETE', `/api/cart/items/${item.editionId}`);
  }
}

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);

  // Textos legales vigentes de los cuatro tipos (inmutables: se crean si no existen).
  for (const type of ['terms', 'privacy', 'withdrawal', 'refunds'] as const) {
    const exists = await prisma.legalDocument.count({ where: { type, version: 'it-base' } });
    if (!exists) {
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

  const area = await prisma.area.create({ data: { slug: `checkout-${run}`, name: 'Checkout' } });
  const base = {
    title: 'Curso de checkout',
    summary: 'Resumen',
    description: 'Descripción',
    modality: 'online' as const,
    durationHours: 10,
    areaId: area.id,
    status: 'published' as const,
  };
  const course = await prisma.course.create({ data: { ...base, slug: `checkout-${run}` } });
  const other = await prisma.course.create({
    data: { ...base, slug: `checkout-otro-${run}`, title: 'Otro curso' },
  });
  ids.course = course.id;
  const edition = (courseId: string, suffix: string, extra: Record<string, unknown> = {}) =>
    prisma.courseEdition.create({
      data: {
        courseId,
        code: code(suffix),
        startsAt: daysFromNow(30),
        endsAt: daysFromNow(60),
        enrollmentClosesAt: daysFromNow(20),
        capacity: 20,
        priceClp: 50_000,
        status: 'published',
        ...extra,
      },
    });
  ids.open = (await edition(course.id, 'A', { taxTreatment: 'taxed' })).id;
  ids.closed = (await edition(course.id, 'B', { enrollmentClosesAt: daysFromNow(-1) })).id;
  ids.scarce = (await edition(course.id, 'C', { capacity: 3 })).id;
  ids.other = (await edition(other.id, 'D', { priceClp: 20_000 })).id;

  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma,
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
  });
  student = await loginAs(app, 'mock-student');
  teacher = await loginAs(app, 'mock-teacher');
  admin = await loginAs(app, 'mock-admin');
  legal = CurrentLegalDocumentsSchema.parse((await app.inject('/api/legal')).json()).items;
  await emptyCart(student);
  await emptyCart(teacher);
});

afterAll(async () => {
  // Sus órdenes impiden borrar estos cursos: se archivan para no alterar los conteos del
  // catálogo público en otros archivos de prueba.
  await prisma.course.updateMany({
    where: { slug: { endsWith: run } },
    data: { status: 'archived' },
  });
  await app.close();
  await prisma.$disconnect();
});

describe('cart', () => {
  it('describes an anonymous browser cart with the reason an item cannot be bought', async () => {
    const response = await app.inject(`/api/cart/preview?editionIds=${ids.open},${ids.closed}`);
    const cart = CartResponseSchema.parse(response.json());
    expect(cart.items.map((item) => item.unavailableReason)).toEqual([
      null,
      'Las inscripciones de esta edición están cerradas.',
    ]);
    expect(cart.subtotalClp).toBe(50_000);
  });

  it('keeps the cart of a signed-in user and merges the browser cart', async () => {
    expect(
      (await send(student, 'POST', '/api/cart/items', { editionId: ids.open })).statusCode,
    ).toBe(200);
    const merged = await send(student, 'POST', '/api/cart/merge', {
      editionIds: [ids.open, ids.other, randomUUID()],
    });
    expect(CartResponseSchema.parse(merged.json()).items.map((item) => item.editionId)).toEqual([
      ids.open,
      ids.other,
    ]);
  });

  it('requires a session and the CSRF token to change the cart', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/cart/items',
      payload: { editionId: ids.open },
    });
    expect(anonymous.statusCode).toBe(401);
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/cart/items',
      headers: { cookie: student.cookie },
      payload: { editionId: ids.open },
    });
    expect(noCsrf.statusCode).toBe(403);
  });
});

describe('quote and coupons', () => {
  it('quotes with a percentage coupon limited to one course', async () => {
    await prisma.coupon.create({
      data: {
        code: code('CURSO15'),
        type: 'percentage',
        value: 15,
        scope: 'course',
        courseId: ids.course,
      },
    });
    const quote = QuoteSchema.parse(
      (await send(student, 'POST', '/api/checkout/quote', { couponCode: code('curso15') })).json(),
    );
    expect(quote.lines.map((line) => line.discountClp)).toEqual([7_500, 0]);
    expect(quote).toMatchObject({
      subtotalClp: 70_000,
      discountClp: 7_500,
      totalClp: 62_500,
      coupon: { code: code('CURSO15'), description: '15 % de descuento' },
      couponError: null,
    });
    expect(quote.legal).toHaveLength(4);
  });

  it('explains why a coupon cannot be used', async () => {
    await prisma.coupon.create({
      data: { code: code('VENCIDO'), type: 'percentage', value: 10, validUntil: daysFromNow(-1) },
    });
    const expired = QuoteSchema.parse(
      (await send(student, 'POST', '/api/checkout/quote', { couponCode: code('VENCIDO') })).json(),
    );
    expect(expired).toMatchObject({ couponError: 'El cupón está vencido.', discountClp: 0 });
    const missing = QuoteSchema.parse(
      (await send(student, 'POST', '/api/checkout/quote', { couponCode: 'NO-EXISTE' })).json(),
    );
    expect(missing.couponError).toBe('El cupón no existe.');
  });
});

describe('checkout', () => {
  it('requires the idempotency key and the current legal versions', async () => {
    const noKey = await send(student, 'POST', '/api/checkout/orders', {
      acceptedLegal: accepted(),
    });
    expect(noKey.statusCode).toBe(400);
    const outdated = await order(student, {
      acceptedLegal: accepted().map((item) => ({ ...item, version: 'vieja' })),
    });
    expect(outdated.statusCode).toBe(409);
    expect(outdated.json().error.code).toBe('LEGAL_NOT_ACCEPTED');
  });

  it('creates the order, reserves the seats and records the legal acceptance', async () => {
    const key = randomUUID();
    const response = await order(
      student,
      {
        couponCode: code('CURSO15'),
        documentType: 'invoice',
        invoice: {
          rut: '76.086.428-5',
          businessName: 'Comercial Austral SpA',
          activity: 'Servicios de capacitación',
          address: 'Av. España 123, Punta Arenas',
        },
      },
      key,
    );
    expect(response.statusCode).toBe(201);
    const summary = OrderSummarySchema.parse(response.json());
    expect(summary).toMatchObject({
      status: 'awaiting_payment',
      totalClp: 62_500,
      couponCode: code('CURSO15'),
      documentType: 'invoice',
    });
    expect(summary.number).toMatch(/^UTA-\d{4}-\d{6}$/);
    const minutes = (Date.parse(summary.expiresAt ?? '') - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    const stored = await prisma.order.findUniqueOrThrow({
      where: { number: summary.number },
      include: { seatReservations: true, salesDocument: true, statusHistory: true },
    });
    expect(stored.seatReservations.map((r) => r.status)).toEqual(['active', 'active']);
    expect(stored.salesDocument).toMatchObject({ type: 'invoice', receiverRut: '76086428-5' });
    expect(stored.legalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.legalAcceptedAt).not.toBeNull();
    expect(stored.legalAcceptedIp).not.toBeNull();
    expect(stored.statusHistory.map((change) => change.toStatus).sort()).toEqual([
      'awaiting_payment',
      'pending',
    ]);
    expect(
      await prisma.auditLog.count({ where: { action: 'order.create', entityId: stored.id } }),
    ).toBe(1);

    // El carrito quedó vacío y la ficha pública muestra un cupo menos.
    const cart = CartResponseSchema.parse(
      (await app.inject({ url: '/api/cart', headers: { cookie: student.cookie } })).json(),
    );
    expect(cart.items).toEqual([]);
    const course = (await app.inject(`/api/catalog/courses/checkout-${run}`)).json();
    expect(course.editions.find((e: { id: string }) => e.id === ids.open).availableSeats).toBe(19);

    // Reintento con la misma clave: la misma orden, sin duplicar.
    const retry = await order(student, { couponCode: code('CURSO15') }, key);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().number).toBe(summary.number);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);

    // Otra persona no puede ver la orden.
    const foreign = await app.inject({
      url: `/api/orders/${summary.number}`,
      headers: { cookie: teacher.cookie },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('does not let the same user buy an edition with a pending order', async () => {
    await send(student, 'POST', '/api/cart/items', { editionId: ids.open });
    const response = await order(student);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.details[0].reason).toContain('orden pendiente');
    await emptyCart(student);
  });

  it('never sells more seats than the capacity under concurrent checkouts', async () => {
    const legalService = new LegalService(prisma, new PrismaAuditRecorder(prisma));
    const service = new CheckoutService({
      prisma,
      audit: new PrismaAuditRecorder(prisma),
      legal: legalService,
      cache: new MemoryCache(),
      reservationTtlMinutes: 15,
    });
    const buyers = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        prisma.user.create({
          data: {
            email: `concurrente-${run}-${index}@example.com`,
            name: `Comprador ${index}`,
            cart: { create: { items: { create: { editionId: ids.scarce } } } },
          },
        }),
      ),
    );
    const results = await Promise.allSettled(
      buyers.map((buyer) =>
        service.createOrder(
          { id: buyer.id },
          { couponCode: null, documentType: 'receipt', invoice: null, acceptedLegal: accepted() },
          randomUUID(),
          { actorId: buyer.id, actorRole: null },
        ),
      ),
    );
    const created = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(created).toHaveLength(3);
    expect(rejected).toHaveLength(5);
    for (const result of rejected) {
      expect((result as PromiseRejectedResult).reason).toMatchObject({ code: 'CART_UNAVAILABLE' });
    }
    expect(
      await prisma.seatReservation.count({ where: { editionId: ids.scarce, status: 'active' } }),
    ).toBe(3);
  });

  it('confirms a 100 % coupon order without payment and creates the enrollment', async () => {
    await prisma.coupon.create({
      data: {
        code: code('BECA'),
        type: 'percentage',
        value: 100,
        maxUsesPerUser: 1,
        reason: 'scholarship',
      },
    });
    await send(teacher, 'POST', '/api/cart/items', { editionId: ids.other });
    const response = await order(teacher, { couponCode: code('BECA') });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'paid', totalClp: 0, expiresAt: null });

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { idpSubject: 'mock-teacher' },
    });
    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { userId_editionId: { userId: teacherUser.id, editionId: ids.other } },
    });
    expect(enrollment).toMatchObject({ source: 'coupon_100', status: 'pending_lms' });
    expect(
      (await prisma.coupon.findUniqueOrThrow({ where: { code: code('BECA') } })).usesCount,
    ).toBe(1);

    // Límite por usuario: no se puede volver a usar.
    await send(teacher, 'POST', '/api/cart/items', { editionId: ids.open });
    const again = await order(teacher, { couponCode: code('BECA') });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toContain('máximo de veces');
    await emptyCart(teacher);
  });

  it('cancels unpaid orders when the payment time runs out and frees seats and coupon uses', async () => {
    const audit = new PrismaAuditRecorder(prisma);
    const later = new CheckoutService({
      prisma,
      audit,
      legal: new LegalService(prisma, audit),
      cache: new MemoryCache(),
      reservationTtlMinutes: 15,
      now: () => new Date(Date.now() + 16 * 60_000),
    });
    const expired = await later.expireStaleOrders();
    expect(expired).toBeGreaterThanOrEqual(4);

    const studentOrder = await prisma.order.findFirstOrThrow({
      where: { couponId: { not: null }, coupon: { code: code('CURSO15') } },
      include: { seatReservations: true, statusHistory: true, coupon: true },
    });
    expect(studentOrder.status).toBe('cancelled');
    expect(studentOrder.seatReservations.every((r) => r.status === 'expired')).toBe(true);
    expect(
      studentOrder.statusHistory.some((change) => change.reason === 'Plazo de pago vencido'),
    ).toBe(true);
    expect(studentOrder.coupon?.usesCount).toBe(0);
  });
});

describe('legal documents and coupons in the panel', () => {
  it('publishes a new legal version that cannot be modified afterwards', async () => {
    const version = `it-${run}`;
    const payload = {
      type: 'refunds',
      version,
      title: 'Política de devoluciones (prueba)',
      content: '## Devoluciones\n\nTexto de prueba.',
      effectiveFrom: '2099-01-01T00:00:00.000Z',
    };
    const created = await send(admin, 'POST', '/api/admin/legal', payload);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ version, current: false });
    expect((await send(admin, 'POST', '/api/admin/legal', payload)).statusCode).toBe(409);
    await expect(
      prisma.legalDocument.update({ where: { id: created.json().id }, data: { title: 'Cambio' } }),
    ).rejects.toThrow();
    expect(
      await prisma.auditLog.count({
        where: { action: 'legal.publish', entityId: created.json().id },
      }),
    ).toBe(1);
  });

  it('manages coupons with audit and rejects duplicated codes', async () => {
    const payload = {
      code: code('panel'),
      type: 'fixed_amount',
      value: 5000,
      scope: 'edition',
      editionId: ids.other,
    };
    const created = await send(admin, 'POST', '/api/admin/coupons', payload);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      code: code('PANEL'),
      scopeLabel: `Otro curso (${code('D')})`,
    });
    expect((await send(admin, 'POST', '/api/admin/coupons', payload)).statusCode).toBe(409);

    const updated = await send(admin, 'PUT', `/api/admin/coupons/${created.json().id}`, {
      ...payload,
      active: false,
    });
    expect(updated.json().active).toBe(false);
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'coupon.update', entityId: created.json().id },
    });
    expect(entry.after).toEqual({ active: false });
  });
});
