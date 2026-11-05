import {
  MAX_PAYMENT_ATTEMPTS,
  type PaymentResult,
  type PaymentReturn,
  type StartPaymentResponse,
} from '@plataforma/shared';
import type { Payment, Prisma, PrismaClient } from '@prisma/client';
import type { Cache } from '../../infra/cache.js';
import { IntegrationError } from '../../integrations/errors.js';
import type { Mailer } from '../../integrations/mailer/port.js';
import type {
  PaymentGateway,
  TransactionDetails,
} from '../../integrations/payment-gateway/port.js';
import { AppError } from '../../lib/errors.js';
import type { AuditEntry, AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import { catalogCacheKeys } from '../catalog/catalog.service.js';
import { releaseOrderHold, transitionOrder, transitionPayment } from './state-machine.js';

export interface PaymentsLogger {
  error(object: unknown, message: string): void;
  warn(object: unknown, message: string): void;
}

export interface PaymentsServiceOptions {
  prisma: PrismaClient;
  gateway: PaymentGateway;
  mailer: Mailer;
  audit: AuditRecorder;
  cache: Cache;
  logger: PaymentsLogger;
  /** URL pública de retorno desde la pasarela. */
  returnUrl: string;
  alertEmail?: string;
  now?: () => Date;
}

/** Margen de la reserva mientras se confirma con la pasarela. */
const CONFIRMATION_HOLD_MS = 5 * 60_000;
/** Una confirmación sin resolver por este tiempo la retoma el worker. */
const STUCK_CONFIRMATION_MS = 2 * 60_000;
/** Pagos que cuentan como intento fallido del comprador. */
const FAILED_ATTEMPT_STATUSES = ['rejected', 'aborted'] as const;

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

class LateConfirmationError extends Error {}

/**
 * Pago de una orden (RF-03, regla 9).
 *
 * El retorno del navegador nunca se da por válido: solo trae un token, y el resultado sale de
 * `commit` en la pasarela, llamado desde el servidor.
 *
 * Antes de `commit` el pago pasa a `confirming` con una actualización condicional. Eso hace
 * idempotente el doble retorno (solo uno confirma), impide cobrar una orden vencida (sin
 * `commit` Webpay no concreta el cobro) y frena el vencimiento durante la confirmación. Si aun
 * así un cobro se concreta sobre una orden que no se puede pagar, se reversa de inmediato y se
 * avisa a la UTA.
 */
export class PaymentsService {
  private readonly now: () => Date;

  constructor(private readonly options: PaymentsServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Crea un intento de pago y devuelve adónde enviar al comprador. */
  async start(userId: string, number: string, actor: AuditActor): Promise<StartPaymentResponse> {
    const { prisma, gateway, returnUrl } = this.options;
    const now = this.now();

    const { order, payment } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE number = ${number} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { number },
        include: { payments: { select: { id: true, status: true } } },
      });
      if (!order || order.userId !== userId) throw AppError.notFound('La orden no existe.');
      if (order.status === 'paid') {
        throw AppError.conflict('ORDER_ALREADY_PAID', 'Esta orden ya está pagada.');
      }
      if (order.status !== 'awaiting_payment' || !order.expiresAt || order.expiresAt <= now) {
        throw AppError.conflict(
          'ORDER_NOT_PAYABLE',
          'El plazo para pagar esta orden terminó. Vuelve a agregar los cursos al carrito.',
        );
      }
      if (order.payments.some((item) => item.status === 'confirming')) {
        throw AppError.conflict(
          'PAYMENT_IN_PROGRESS',
          'Estamos confirmando tu pago. Espera unos segundos y recarga la página.',
        );
      }
      // Un intento anterior sin terminar queda sin efecto: su token ya no se confirmará.
      for (const item of order.payments.filter((entry) => entry.status === 'created')) {
        await transitionPayment(tx, item.id, 'created', 'failed');
      }
      const attempt = order.payments.length + 1;
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: gateway.provider,
          buyOrder: `${order.number}-${attempt}`,
          amountClp: order.totalClp,
          idempotencyKey: `${order.id}:${attempt}`,
        },
      });
      await this.options.audit.record(
        {
          ...actor,
          action: 'payment.start',
          entityType: 'payment',
          entityId: payment.id,
          after: { order: order.number, amountClp: order.totalClp, attempt },
        },
        tx,
      );
      return { order, payment };
    });

    try {
      const created = await gateway.createTransaction({
        buyOrder: payment.buyOrder,
        sessionId: order.id,
        amount: order.totalClp,
        returnUrl,
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { token: created.token } });
      return { redirectUrl: created.redirectUrl, formFields: created.formFields ?? null };
    } catch (error) {
      this.options.logger.error({ err: error, paymentId: payment.id }, 'Payment start failed');
      await prisma.$transaction((tx) => transitionPayment(tx, payment.id, 'created', 'failed'));
      throw new AppError(
        503,
        'GATEWAY_UNAVAILABLE',
        'La pasarela de pagos no está disponible. Intenta nuevamente en unos minutos.',
      );
    }
  }

  /** Procesa el retorno de la pasarela y devuelve la ruta de la SPA adonde enviar al comprador. */
  async handleReturn(query: PaymentReturn): Promise<string> {
    const { prisma } = this.options;
    // Webpay envía TBK_* si el comprador anuló el pago o se agotó el tiempo del formulario.
    const abandoned = Boolean(query.TBK_TOKEN || query.TBK_ORDEN_COMPRA);
    const token = query.TBK_TOKEN ?? query.token_ws;
    const payment = await prisma.payment.findFirst({
      where: token ? { token } : { buyOrder: query.TBK_ORDEN_COMPRA ?? '' },
      include: { order: { select: { number: true } } },
    });
    if (!payment) return '/?pago=error';

    const result = abandoned ? await this.abandon(payment) : await this.confirm(payment);
    return `/ordenes/${payment.order.number}?pago=${result}`;
  }

  private async abandon(payment: Payment): Promise<PaymentResult> {
    if (payment.status !== 'created') return resultOf(payment);
    const moved = await this.options.prisma.$transaction(async (tx) => {
      const changed = await transitionPayment(tx, payment.id, 'created', 'aborted');
      if (changed) await this.closeIfNoAttemptsLeft(tx, payment.orderId);
      return changed;
    });
    if (moved) await this.record(payment, 'payment.aborted');
    return 'abandonado';
  }

  private async confirm(payment: Payment): Promise<PaymentResult> {
    const { prisma, gateway } = this.options;
    if (payment.status !== 'created') return resultOf(payment);

    const now = this.now();
    const claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: 'created',
          order: { status: 'awaiting_payment', expiresAt: { gt: now } },
        },
        data: { status: 'confirming' },
      });
      if (updated.count === 0) return false;
      // El cupo sigue retenido durante la confirmación aunque el plazo venza en ese momento.
      await tx.seatReservation.updateMany({
        where: { orderId: payment.orderId, status: 'active' },
        data: { expiresAt: new Date(now.getTime() + CONFIRMATION_HOLD_MS) },
      });
      return true;
    });

    if (!claimed) {
      const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status !== 'created') return resultOf(current);
      // Orden vencida: sin `commit` no hay cobro.
      await prisma.$transaction((tx) => transitionPayment(tx, payment.id, 'created', 'aborted'));
      await this.record(payment, 'payment.expired');
      return 'vencido';
    }

    let details: TransactionDetails;
    try {
      details = await gateway.commit(payment.token ?? '');
    } catch (error) {
      this.options.logger.warn(
        { err: error, paymentId: payment.id },
        'Payment commit failed, checking the status',
      );
      try {
        details = await gateway.getStatus(payment.token ?? '');
      } catch {
        // Resultado desconocido: el pago sigue `confirming` y lo retoma `recoverConfirmations`.
        return 'procesando';
      }
    }
    return this.settle(payment, details);
  }

  /** Aplica el resultado que entregó la pasarela a un pago en `confirming`. */
  private async settle(payment: Payment, details: TransactionDetails): Promise<PaymentResult> {
    if (details.status === 'authorized') return this.settleAuthorized(payment, details);

    const { prisma } = this.options;
    if (details.status === 'failed') {
      await prisma.$transaction(async (tx) => {
        const moved = await transitionPayment(tx, payment.id, 'confirming', 'rejected', {
          rawResponse: toJson(details.raw),
        });
        if (moved) await this.closeIfNoAttemptsLeft(tx, payment.orderId);
      });
      await this.record(payment, 'payment.rejected');
      return 'rechazado';
    }

    await prisma.$transaction((tx) =>
      transitionPayment(tx, payment.id, 'confirming', 'failed', {
        rawResponse: toJson(details.raw),
      }),
    );
    await this.record(payment, 'payment.failed');
    return 'error';
  }

  private async settleAuthorized(
    payment: Payment,
    details: TransactionDetails,
  ): Promise<PaymentResult> {
    const { prisma, audit } = this.options;
    if (details.amount !== payment.amountClp || details.buyOrder !== payment.buyOrder) {
      return this.reverse(payment, details, 'El monto u orden de la pasarela no coincide');
    }

    const now = this.now();
    let editionIds: string[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.orderId },
          include: { items: true },
        });
        if (order.status !== 'awaiting_payment') throw new LateConfirmationError();

        const moved = await transitionPayment(tx, payment.id, 'confirming', 'authorized', {
          ...(details.authorizationCode ? { authorizationCode: details.authorizationCode } : {}),
          ...(details.cardLast4 ? { cardLast4: details.cardLast4 } : {}),
          ...(details.paymentType ? { paymentType: details.paymentType } : {}),
          ...(details.installments !== undefined ? { installments: details.installments } : {}),
          rawResponse: toJson(details.raw),
          confirmedAt: now,
        });
        if (!moved) return;

        await transitionOrder(
          tx,
          order.id,
          'awaiting_payment',
          'paid',
          'Pago confirmado con la pasarela',
          { paidAt: now },
        );
        await tx.seatReservation.updateMany({
          where: { orderId: order.id, status: 'active' },
          data: { status: 'consumed' },
        });
        // Matrícula en el Aula Virtual: la procesa la cola `enrollment` (Fase 5).
        await tx.enrollment.createMany({
          data: order.items.map((item) => ({
            userId: order.userId,
            editionId: item.editionId,
            orderItemId: item.id,
            source: 'purchase' as const,
          })),
        });
        await audit.record(
          {
            actorId: order.userId,
            actorRole: null,
            action: 'payment.authorized',
            entityType: 'payment',
            entityId: payment.id,
            after: { order: order.number, amountClp: details.amount, status: 'authorized' },
          },
          tx,
        );
        editionIds = order.items.map((item) => item.editionId);
      });
    } catch (error) {
      if (error instanceof LateConfirmationError) {
        return this.reverse(payment, details, 'La orden ya no se puede pagar');
      }
      throw error;
    }
    await this.options.cache.delete(editionIds.map((id) => catalogCacheKeys.seats(id)));
    return 'aprobado';
  }

  /** Devuelve de inmediato un cobro que no se puede aplicar a la orden y avisa a la UTA. */
  private async reverse(
    payment: Payment,
    details: TransactionDetails,
    reason: string,
  ): Promise<PaymentResult> {
    const { prisma, gateway, logger } = this.options;
    await prisma.$transaction((tx) =>
      transitionPayment(tx, payment.id, 'confirming', 'failed', {
        rawResponse: toJson(details.raw),
      }),
    );
    let reversed = true;
    try {
      await gateway.refund({ token: payment.token ?? '', amount: details.amount });
    } catch (error) {
      reversed = false;
      logger.error({ err: error, paymentId: payment.id }, 'Automatic reversal failed');
    }
    await this.record(payment, 'payment.reversed', { reason, reversed, amountClp: details.amount });
    await this.alert(
      reversed ? 'Pago reversado automáticamente' : 'URGENTE: reversa de pago fallida',
      `${reason}. Orden de compra ${payment.buyOrder}, monto ${details.amount} CLP. ` +
        (reversed ? 'El cobro fue reversado.' : 'El cobro NO se reversó: revisar en la pasarela.'),
    );
    return 'error';
  }

  /** Al agotar los intentos, la orden pasa a `failed` y libera cupos y cupón. */
  private async closeIfNoAttemptsLeft(tx: Prisma.TransactionClient, orderId: string) {
    const attempts = await tx.payment.count({
      where: { orderId, status: { in: [...FAILED_ATTEMPT_STATUSES] } },
    });
    if (attempts < MAX_PAYMENT_ATTEMPTS) return;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    if (order.status !== 'awaiting_payment') return;
    await transitionOrder(tx, orderId, 'awaiting_payment', 'failed', 'Intentos de pago agotados');
    await releaseOrderHold(tx, orderId, 'released');
  }

  /**
   * Retoma los pagos que quedaron `confirming` (caída o corte durante `commit`): consulta la
   * pasarela y aplica el resultado. Lo ejecuta el worker cada minuto.
   */
  async recoverConfirmations(): Promise<number> {
    const { prisma, gateway, logger } = this.options;
    const stuck = await prisma.payment.findMany({
      where: {
        status: 'confirming',
        updatedAt: { lte: new Date(this.now().getTime() - STUCK_CONFIRMATION_MS) },
      },
      take: 50,
    });
    let recovered = 0;
    for (const payment of stuck) {
      try {
        const details = await gateway.getStatus(payment.token ?? '');
        await this.settle(payment, details);
        recovered += 1;
      } catch (error) {
        if (error instanceof IntegrationError && error.retryable) {
          logger.warn({ err: error, paymentId: payment.id }, 'Payment status unavailable');
          continue;
        }
        logger.error({ err: error, paymentId: payment.id }, 'Payment could not be recovered');
        await prisma.$transaction((tx) =>
          transitionPayment(tx, payment.id, 'confirming', 'failed'),
        );
        await this.alert(
          'Pago sin confirmar',
          `No se pudo consultar el pago ${payment.buyOrder} en la pasarela. Revisarlo manualmente.`,
        );
      }
    }
    return recovered;
  }

  private async record(
    payment: Payment,
    action: string,
    after: AuditEntry['after'] = undefined,
  ): Promise<void> {
    await this.options.audit.record({
      actorId: null,
      actorRole: null,
      action,
      entityType: 'payment',
      entityId: payment.id,
      ...(after === undefined ? {} : { after }),
    });
  }

  private async alert(subject: string, text: string): Promise<void> {
    const { alertEmail, mailer, logger } = this.options;
    logger.error({ subject }, 'Payment alert');
    if (!alertEmail) return;
    await mailer
      .send({ to: alertEmail, subject: `[Cursos UTA] ${subject}`, text, html: `<p>${text}</p>` })
      .catch((error: unknown) => logger.error({ err: error }, 'Alert email failed'));
  }
}

/** Resultado de un pago ya resuelto: el doble retorno muestra lo mismo sin volver a confirmar. */
function resultOf(payment: Pick<Payment, 'status'>): PaymentResult {
  switch (payment.status) {
    case 'authorized':
    case 'partially_refunded':
    case 'refunded':
      return 'aprobado';
    case 'rejected':
      return 'rechazado';
    case 'aborted':
      return 'abandonado';
    case 'confirming':
      return 'procesando';
    default:
      return 'error';
  }
}
