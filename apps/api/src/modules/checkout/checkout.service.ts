import {
  CART_MAX_ITEMS,
  MAX_PAYMENT_ATTEMPTS,
  type CartItem,
  type CartResponse,
  type CreateOrder,
  type OrderSummary,
  type Quote,
  type QuoteLine,
} from '@plataforma/shared';
import { Prisma, type Lead, type PrismaClient } from '@prisma/client';
import type { Cache } from '../../infra/cache.js';
import { AppError } from '../../lib/errors.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import { catalogCacheKeys, isEnrollmentOpen } from '../catalog/catalog.service.js';
import { consumeWaitlistHolds, createEnrollment } from '../enrollment/enrollment-records.js';
import { acceptanceHash, type LegalService } from '../legal/legal.service.js';
import { releaseOrderHold, transitionOrder, transitionPayment } from '../payments/state-machine.js';
import {
  appliesTo,
  checkCoupon,
  describeCoupon,
  priceLines,
  totals,
  type CouponRules,
} from './pricing.js';

export type Db = PrismaClient | Prisma.TransactionClient;

export interface CheckoutServiceOptions {
  prisma: PrismaClient;
  audit: AuditRecorder;
  legal: LegalService;
  cache: Cache;
  reservationTtlMinutes: number;
  now?: () => Date;
}

/** Estados de orden que ya no retienen cupos ni usos de cupón. */
const CLOSED_ORDER_STATUSES = ['failed', 'cancelled'] as const;

const editionInclude = {
  course: { select: { id: true, slug: true, title: true, status: true } },
} satisfies Prisma.CourseEditionInclude;
type EditionRow = Prisma.CourseEditionGetPayload<{ include: typeof editionInclude }>;

export interface Availability {
  edition: EditionRow;
  reason: string | null;
}

const UNAVAILABLE = 'Esta edición ya no está disponible.';
const CLOSED = 'Las inscripciones de esta edición están cerradas.';
export const SOLD_OUT = 'Esta edición no tiene cupos disponibles.';
const ENROLLED = 'Ya estás inscrito en esta edición.';
const PENDING = 'Ya tienes una orden pendiente de pago para esta edición.';

function couponRules(row: Prisma.CouponGetPayload<object>): CouponRules {
  return {
    code: row.code,
    type: row.type,
    value: row.value,
    scope: row.scope,
    courseId: row.courseId,
    editionId: row.editionId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    maxUses: row.maxUses,
    maxUsesPerUser: row.maxUsesPerUser,
    usesCount: row.usesCount,
    active: row.active,
  };
}

const orderNumber = (year: number, sequence: bigint) =>
  `UTA-${year}-${sequence.toString().padStart(6, '0')}`;

/**
 * Carrito, cotización y confirmación de la compra (RF-03, RF-04, RF-11).
 *
 * Control de cupos: al confirmar, se bloquean las filas de las ediciones (`FOR UPDATE`, en orden
 * de id para evitar bloqueos mutuos) y se cuentan inscripciones y reservas vigentes dentro de la
 * transacción. Dos compras simultáneas del último cupo no pueden confirmarse ambas.
 */
export class CheckoutService {
  private readonly now: () => Date;

  constructor(private readonly options: CheckoutServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  // --- Carrito -----------------------------------------------------------------------------

  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.options.prisma.cart.findUnique({
      where: { userId },
      include: { items: { orderBy: { createdAt: 'asc' }, select: { editionId: true } } },
    });
    return this.describe(cart?.items.map((item) => item.editionId) ?? [], userId);
  }

  /** Carrito de un visitante sin sesión (los ids viven en su navegador). */
  async preview(editionIds: readonly string[]): Promise<CartResponse> {
    return this.describe([...new Set(editionIds)], null);
  }

  async addItem(userId: string, editionId: string): Promise<CartResponse> {
    await this.addItems(userId, [editionId], true);
    return this.getCart(userId);
  }

  /** Fusiona el carrito del navegador al iniciar sesión (ignora ediciones que ya no existen). */
  async merge(userId: string, editionIds: readonly string[]): Promise<CartResponse> {
    await this.addItems(userId, editionIds, false);
    return this.getCart(userId);
  }

  async removeItem(userId: string, editionId: string): Promise<CartResponse> {
    await this.options.prisma.cartItem.deleteMany({ where: { cart: { userId }, editionId } });
    return this.getCart(userId);
  }

  private async addItems(userId: string, editionIds: readonly string[], strict: boolean) {
    const { prisma } = this.options;
    const editions = await prisma.courseEdition.findMany({
      where: { id: { in: [...editionIds] }, status: 'published', course: { status: 'published' } },
      select: { id: true },
    });
    if (strict && editions.length === 0) throw AppError.notFound(UNAVAILABLE);

    const cart = await prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: { select: { editionId: true } } },
    });
    const existing = new Set(cart.items.map((item) => item.editionId));
    const toAdd = editions.map((edition) => edition.id).filter((id) => !existing.has(id));
    if (existing.size + toAdd.length > CART_MAX_ITEMS) {
      throw AppError.conflict(
        'CART_FULL',
        `El carrito admite hasta ${CART_MAX_ITEMS} ediciones. Completa una compra antes de agregar más.`,
      );
    }
    if (toAdd.length > 0) {
      await prisma.cartItem.createMany({
        data: toAdd.map((editionId) => ({ cartId: cart.id, editionId })),
        skipDuplicates: true,
      });
    }
  }

  private async describe(editionIds: readonly string[], userId: string | null) {
    const availability = await this.availability(this.options.prisma, editionIds, userId);
    const items: CartItem[] = availability.map(({ edition, reason }) => ({
      editionId: edition.id,
      editionCode: edition.code,
      courseSlug: edition.course.slug,
      courseTitle: edition.course.title,
      startsAt: edition.startsAt.toISOString(),
      priceClp: edition.priceClp,
      taxTreatment: edition.taxTreatment,
      unavailableReason: reason,
    }));
    const subtotalClp = items
      .filter((item) => item.unavailableReason === null)
      .reduce((sum, item) => sum + item.priceClp, 0);
    return { items, subtotalClp };
  }

  /**
   * Si cada edición se puede comprar ahora (estado, plazo, cupos, inscripción o compra
   * pendiente del mismo usuario). Mantiene el orden de `editionIds`.
   */
  async availability(
    db: Db,
    editionIds: readonly string[],
    userId: string | null,
  ): Promise<Availability[]> {
    if (editionIds.length === 0) return [];
    const now = this.now();
    const ids = [...editionIds];
    const [editions, enrollments, reservations, mine] = await Promise.all([
      db.courseEdition.findMany({ where: { id: { in: ids } }, include: editionInclude }),
      db.enrollment.groupBy({
        by: ['editionId'],
        where: { editionId: { in: ids }, status: { not: 'withdrawn' } },
        _count: { _all: true },
      }),
      db.seatReservation.groupBy({
        by: ['editionId'],
        where: { editionId: { in: ids }, status: 'active', expiresAt: { gt: now } },
        _count: { _all: true },
      }),
      userId
        ? Promise.all([
            db.enrollment.findMany({
              where: { userId, editionId: { in: ids }, status: { not: 'withdrawn' } },
              select: { editionId: true },
            }),
            db.seatReservation.findMany({
              where: { userId, editionId: { in: ids }, status: 'active', expiresAt: { gt: now } },
              select: { editionId: true, orderId: true },
            }),
          ])
        : Promise.resolve([[], []] as const),
    ]);
    const taken = new Map(enrollments.map((row) => [row.editionId, row._count._all]));
    const reserved = new Map(reservations.map((row) => [row.editionId, row._count._all]));
    const enrolled = new Set(mine[0].map((row) => row.editionId));
    // Una reserva sin orden es el cupo que la lista de espera le retiene a este usuario.
    const reservationsOfUser: readonly { editionId: string; orderId: string | null }[] = mine[1];
    const pending = new Set(
      reservationsOfUser.filter((row) => row.orderId !== null).map((row) => row.editionId),
    );
    const held = new Set(
      reservationsOfUser.filter((row) => row.orderId === null).map((row) => row.editionId),
    );
    const byId = new Map(editions.map((edition) => [edition.id, edition]));

    return ids.flatMap((id) => {
      const edition = byId.get(id);
      if (!edition) return [];
      let reason: string | null = null;
      if (edition.status !== 'published' || edition.course.status !== 'published') {
        reason = UNAVAILABLE;
      } else if (
        !isEnrollmentOpen(
          {
            enrollmentOpensAt: edition.enrollmentOpensAt?.toISOString() ?? null,
            enrollmentClosesAt: edition.enrollmentClosesAt.toISOString(),
          },
          now,
        )
      ) {
        reason = CLOSED;
      } else if (enrolled.has(id)) {
        reason = ENROLLED;
      } else if (pending.has(id)) {
        reason = PENDING;
      } else if (
        !held.has(id) &&
        edition.capacity - (taken.get(id) ?? 0) - (reserved.get(id) ?? 0) <= 0
      ) {
        reason = SOLD_OUT;
      }
      return [{ edition, reason }];
    });
  }

  // --- Cotización ---------------------------------------------------------------------------

  async quote(userId: string, couponCode: string | null): Promise<Quote> {
    const { prisma, legal } = this.options;
    const cart = await this.getCart(userId);
    const available = cart.items.filter((item) => item.unavailableReason === null);
    const editions = await prisma.courseEdition.findMany({
      where: { id: { in: available.map((item) => item.editionId) } },
      select: { id: true, courseId: true },
    });
    const courseOf = new Map(editions.map((edition) => [edition.id, edition.courseId]));
    const items = available.map((item) => ({
      editionId: item.editionId,
      courseId: courseOf.get(item.editionId) ?? '',
      unitPriceClp: item.priceClp,
    }));

    const resolved = couponCode
      ? await this.resolveCoupon(prisma, couponCode, userId, items)
      : null;
    const coupon = resolved?.ok ? resolved.coupon : null;
    const lines = priceLines(items, coupon);
    const byId = new Map(available.map((item) => [item.editionId, item]));
    const current = await legal.current();

    return {
      lines: lines.map((line) => toQuoteLine(line, byId.get(line.editionId))),
      ...totals(lines),
      coupon: coupon ? { code: coupon.code, description: describeCoupon(coupon) } : null,
      couponError: resolved && !resolved.ok ? resolved.reason : null,
      legal: current.map(({ type, version, title }) => ({ type, version, title })),
    };
  }

  private async resolveCoupon(
    db: Db,
    code: string,
    userId: string,
    items: readonly { editionId: string; courseId: string; unitPriceClp: number }[],
    lock = false,
  ): Promise<{ ok: true; coupon: CouponRules; id: string } | { ok: false; reason: string }> {
    const normalized = code.trim().toUpperCase();
    if (lock) {
      await db.$queryRaw`SELECT id FROM coupons WHERE code = ${normalized} FOR UPDATE`;
    }
    const row = await db.coupon.findUnique({ where: { code: normalized } });
    if (!row) return { ok: false, reason: 'El cupón no existe.' };
    const userUses = await db.couponRedemption.count({
      where: {
        couponId: row.id,
        userId,
        order: { status: { notIn: [...CLOSED_ORDER_STATUSES] } },
      },
    });
    const coupon = couponRules(row);
    const check = checkCoupon(coupon, { userUses }, this.now());
    if (!check.ok) return check;
    if (!items.some((item) => appliesTo(coupon, item))) {
      return { ok: false, reason: 'El cupón no aplica a los cursos de tu carrito.' };
    }
    return { ok: true, coupon, id: row.id };
  }

  // --- Confirmación -------------------------------------------------------------------------

  /**
   * Crea la orden a partir del carrito: congela precios y descuentos, reserva los cupos por
   * `SEAT_RESERVATION_TTL_MINUTES`, registra la aceptación legal y el documento tributario.
   * Con total $0 (cupón 100 %) queda pagada sin pasar por la pasarela. Idempotente por
   * `idempotencyKey`: un reintento devuelve la misma orden.
   */
  async createOrder(
    user: { id: string },
    input: CreateOrder,
    idempotencyKey: string,
    actor: AuditActor & { ip?: string },
  ): Promise<{ order: OrderSummary; created: boolean }> {
    const { prisma, legal } = this.options;

    const existing = await this.findByKey(idempotencyKey, user.id);
    if (existing) return { order: existing, created: false };

    const required = await legal.requiredForCheckout();
    const accepted = new Map(input.acceptedLegal.map((item) => [item.type, item.version]));
    if (required.some((doc) => accepted.get(doc.type) !== doc.version)) {
      throw new AppError(
        409,
        'LEGAL_NOT_ACCEPTED',
        'Debes aceptar la versión vigente de todos los textos legales. Si cambiaron, revísalos nuevamente.',
      );
    }

    let result: { number: string; editionIds: string[] };
    try {
      result = await prisma.$transaction(
        (tx) => this.createOrderTx(tx, user.id, input, idempotencyKey, actor, required),
        { maxWait: 15_000, timeout: 20_000 },
      );
    } catch (error) {
      // Dos confirmaciones simultáneas con la misma clave: la segunda devuelve la primera.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const order = await this.findByKey(idempotencyKey, user.id);
        if (order) return { order, created: false };
      }
      throw error;
    }

    await this.options.cache.delete(result.editionIds.map((id) => catalogCacheKeys.seats(id)));
    const order = await this.getOrder(user.id, result.number);
    return { order, created: true };
  }

  private async createOrderTx(
    tx: Prisma.TransactionClient,
    userId: string,
    input: CreateOrder,
    idempotencyKey: string,
    actor: AuditActor & { ip?: string },
    legalDocs: Awaited<ReturnType<LegalService['requiredForCheckout']>>,
  ) {
    const now = this.now();
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: { items: { orderBy: { createdAt: 'asc' }, select: { editionId: true } } },
    });
    const editionIds = cart?.items.map((item) => item.editionId) ?? [];
    if (editionIds.length === 0) {
      throw AppError.conflict('CART_EMPTY', 'Tu carrito está vacío.');
    }

    // Bloqueo de cupos: filas de las ediciones en orden fijo.
    const sorted = [...editionIds].sort();
    await tx.$queryRaw`SELECT id FROM course_editions WHERE id IN (${Prisma.join(
      sorted.map((id) => Prisma.sql`${id}::uuid`),
    )}) ORDER BY id FOR UPDATE`;

    const availability = await this.availability(tx, editionIds, userId);
    const blocked = availability.filter((item) => item.reason !== null);
    if (blocked.length > 0 || availability.length !== editionIds.length) {
      throw new AppError(
        409,
        'CART_UNAVAILABLE',
        'Algunos cursos de tu carrito ya no se pueden comprar. Revisa el carrito.',
        blocked.map((item) => ({ editionId: item.edition.id, reason: item.reason })),
      );
    }

    const items = availability.map(({ edition }) => ({
      editionId: edition.id,
      courseId: edition.course.id,
      unitPriceClp: edition.priceClp,
    }));
    let couponId: string | null = null;
    let coupon: CouponRules | null = null;
    if (input.couponCode) {
      const resolved = await this.resolveCoupon(tx, input.couponCode, userId, items, true);
      if (!resolved.ok) throw new AppError(409, 'COUPON_INVALID', resolved.reason);
      couponId = resolved.id;
      coupon = resolved.coupon;
    }
    const lines = priceLines(items, coupon);
    const amounts = totals(lines);
    const free = amounts.totalClp === 0;
    const status = free ? 'paid' : 'awaiting_payment';
    const expiresAt = free
      ? null
      : new Date(now.getTime() + this.options.reservationTtlMinutes * 60_000);

    const [{ value: sequence }] = await tx.$queryRaw<
      [{ value: bigint }]
    >`SELECT nextval('order_number_seq') AS value`;
    const number = orderNumber(now.getUTCFullYear(), sequence);
    const editionById = new Map(availability.map(({ edition }) => [edition.id, edition]));

    const lead = await this.leadFor(tx, userId);
    const utm = input.utm ?? leadUtm(lead);

    const order = await tx.order.create({
      data: {
        number,
        userId,
        status,
        ...amounts,
        couponId,
        documentType: input.documentType,
        legalVersions: legalDocs.map(({ type, version, contentSha256 }) => ({
          type,
          version,
          contentSha256,
        })),
        legalHash: acceptanceHash(legalDocs),
        legalAcceptedIp: actor.ip ?? null,
        legalAcceptedAt: now,
        utmSource: utm?.source ?? null,
        utmMedium: utm?.medium ?? null,
        utmCampaign: utm?.campaign ?? null,
        utmTerm: utm?.term ?? null,
        utmContent: utm?.content ?? null,
        leadId: lead?.id ?? null,
        idempotencyKey,
        expiresAt,
        paidAt: free ? now : null,
        items: {
          create: lines.map((line) => {
            const edition = editionById.get(line.editionId) as EditionRow;
            return {
              editionId: line.editionId,
              courseTitle: edition.course.title,
              unitPriceClp: line.unitPriceClp,
              discountClp: line.discountClp,
              totalClp: line.totalClp,
              taxTreatment: edition.taxTreatment,
            };
          }),
        },
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'pending', reason: 'Checkout confirmado' },
            {
              fromStatus: 'pending',
              toStatus: status,
              reason: free ? 'Total $0: no requiere pago' : 'Cupos reservados, esperando pago',
            },
          ],
        },
        salesDocument: {
          create: {
            type: input.documentType,
            ...(input.documentType === 'invoice' && input.invoice
              ? {
                  receiverRut: input.invoice.rut,
                  receiverName: input.invoice.businessName,
                  receiverActivity: input.invoice.activity,
                  receiverAddress: input.invoice.address,
                }
              : {}),
          },
        },
      },
      include: { items: true },
    });

    await tx.seatReservation.createMany({
      data: editionIds.map((editionId) => ({
        editionId,
        userId,
        orderId: order.id,
        status: free ? ('consumed' as const) : ('active' as const),
        expiresAt: expiresAt ?? now,
      })),
    });

    if (couponId) {
      await tx.coupon.update({ where: { id: couponId }, data: { usesCount: { increment: 1 } } });
      await tx.couponRedemption.create({ data: { couponId, orderId: order.id, userId } });
    }

    if (free) {
      // Matrícula en el Aula Virtual: la procesa la cola `enrollment` (Fase 5).
      for (const item of order.items) {
        await createEnrollment(tx, {
          userId,
          editionId: item.editionId,
          orderItemId: item.id,
          source: coupon ? 'coupon_100' : 'purchase',
        });
      }
    }

    await consumeWaitlistHolds(tx, userId, editionIds);
    await tx.cartItem.deleteMany({
      where: { cartId: cart?.id ?? '', editionId: { in: editionIds } },
    });

    await this.options.audit.record(
      {
        ...actor,
        action: 'order.create',
        entityType: 'order',
        entityId: order.id,
        after: {
          number,
          status,
          ...amounts,
          couponCode: coupon?.code ?? null,
          editions: editionIds,
          documentType: input.documentType,
          legalHash: order.legalHash,
        },
      },
      tx,
    );

    return { number, editionIds };
  }

  /** Último interesado con el correo del comprador: enlaza la orden con su campaña (RF-02). */
  private async leadFor(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return null;
    return tx.lead.findFirst({
      where: { email: user.email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findByKey(key: string, userId: string): Promise<OrderSummary | null> {
    const order = await this.options.prisma.order.findUnique({
      where: { idempotencyKey: key },
      select: { number: true, userId: true },
    });
    if (!order) return null;
    if (order.userId !== userId) {
      throw AppError.conflict(
        'IDEMPOTENCY_CONFLICT',
        'La solicitud no es válida. Recarga la página.',
      );
    }
    return this.getOrder(userId, order.number);
  }

  /** Orden del propio usuario (404 si no existe o es de otra persona). */
  async getOrder(userId: string, number: string): Promise<OrderSummary> {
    const order = await this.options.prisma.order.findUnique({
      where: { number },
      include: {
        items: { include: { edition: { select: { code: true } } } },
        coupon: { select: { code: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order || order.userId !== userId) throw AppError.notFound('La orden no existe.');
    const latest = order.payments[0];
    const failedAttempts = order.payments.filter((payment) =>
      ['rejected', 'aborted'].includes(payment.status),
    ).length;
    return {
      number: order.number,
      status: order.status,
      lines: order.items.map((item) => ({
        editionId: item.editionId,
        courseTitle: item.courseTitle,
        editionCode: item.edition.code,
        unitPriceClp: item.unitPriceClp,
        discountClp: item.discountClp,
        totalClp: item.totalClp,
        taxTreatment: item.taxTreatment,
      })),
      subtotalClp: order.subtotalClp,
      discountClp: order.discountClp,
      totalClp: order.totalClp,
      couponCode: order.coupon?.code ?? null,
      documentType: order.documentType,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      payment: latest
        ? {
            status: latest.status,
            authorizationCode: latest.authorizationCode,
            cardLast4: latest.cardLast4,
            paymentType: latest.paymentType,
            installments: latest.installments,
            confirmedAt: latest.confirmedAt?.toISOString() ?? null,
          }
        : null,
      paymentAttemptsLeft: Math.max(0, MAX_PAYMENT_ATTEMPTS - failedAttempts),
    };
  }

  // --- Vencimiento --------------------------------------------------------------------------

  /**
   * Anula las órdenes cuyo plazo de pago venció: libera los cupos y el uso del cupón. Los cupos
   * ya no cuentan desde el vencimiento (las reservas vencidas se ignoran al contar); esto deja
   * el estado consistente. Lo ejecuta el worker cada minuto.
   */
  async expireStaleOrders(): Promise<number> {
    const { prisma } = this.options;
    const now = this.now();
    const stale = await prisma.order.findMany({
      // Un pago en confirmación decide por sí mismo el destino de la orden.
      where: {
        status: 'awaiting_payment',
        expiresAt: { lte: now },
        payments: { none: { status: 'confirming' } },
      },
      select: { id: true },
      take: 200,
    });
    let expired = 0;
    for (const { id } of stale) {
      const changed = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUniqueOrThrow({
          where: { id },
          select: { status: true, payments: { select: { id: true, status: true } } },
        });
        if (
          order.status !== 'awaiting_payment' ||
          order.payments.some((payment) => payment.status === 'confirming')
        ) {
          return false;
        }
        await transitionOrder(tx, id, 'awaiting_payment', 'cancelled', 'Plazo de pago vencido');
        await releaseOrderHold(tx, id, 'expired');
        for (const payment of order.payments.filter((item) => item.status === 'created')) {
          await transitionPayment(tx, payment.id, 'created', 'aborted');
        }
        await this.options.audit.record(
          {
            actorId: null,
            actorRole: null,
            action: 'order.expire',
            entityType: 'order',
            entityId: id,
            before: { status: 'awaiting_payment' },
            after: { status: 'cancelled' },
          },
          tx,
        );
        return true;
      });
      if (changed) expired += 1;
    }
    return expired;
  }
}

function leadUtm(lead: Lead | null): CreateOrder['utm'] {
  if (!lead) return undefined;
  return {
    ...(lead.utmSource ? { source: lead.utmSource } : {}),
    ...(lead.utmMedium ? { medium: lead.utmMedium } : {}),
    ...(lead.utmCampaign ? { campaign: lead.utmCampaign } : {}),
    ...(lead.utmTerm ? { term: lead.utmTerm } : {}),
    ...(lead.utmContent ? { content: lead.utmContent } : {}),
  };
}

function toQuoteLine(
  line: ReturnType<typeof priceLines>[number],
  item: CartItem | undefined,
): QuoteLine {
  return {
    editionId: line.editionId,
    courseTitle: item?.courseTitle ?? '',
    editionCode: item?.editionCode ?? '',
    unitPriceClp: line.unitPriceClp,
    discountClp: line.discountClp,
    totalClp: line.totalClp,
    taxTreatment: item?.taxTreatment ?? 'exempt',
  };
}
