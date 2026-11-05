import type { AdminOrder, OrderStatus, RefundRequest } from '@plataforma/shared';
import { type PrismaClient } from '@prisma/client';
import type { Cache } from '../../infra/cache.js';
import type { PaymentGateway } from '../../integrations/payment-gateway/port.js';
import { AppError } from '../../lib/errors.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import { catalogCacheKeys } from '../catalog/catalog.service.js';
import type { CheckoutService } from '../checkout/checkout.service.js';
import { transitionOrder, transitionPayment } from './state-machine.js';

export interface RefundsServiceOptions {
  prisma: PrismaClient;
  gateway: PaymentGateway;
  audit: AuditRecorder;
  cache: Cache;
  checkout: CheckoutService;
  now?: () => Date;
}

const REFUNDABLE_ORDER_STATUSES: readonly OrderStatus[] = ['paid', 'partially_refunded'];
const NOT_FOUND = 'La orden no existe.';

/**
 * Consulta de órdenes y devoluciones por la pasarela (RF-03). La llamada a la pasarela va entre
 * dos transacciones: la orden queda en `refund_requested` mientras tanto, lo que impide una
 * segunda devolución simultánea. La devolución total retira las inscripciones y libera los
 * cupos; el barrido `sync-withdrawals` desmatricula en el Aula Virtual.
 */
export class RefundsService {
  private readonly now: () => Date;

  constructor(private readonly options: RefundsServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async adminOrder(number: string): Promise<AdminOrder> {
    const order = await this.options.prisma.order.findUnique({
      where: { number },
      include: {
        user: { select: { name: true, email: true } },
        payments: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw AppError.notFound(NOT_FOUND);

    const summary = await this.options.checkout.getOrder(order.userId, number);
    const paid = order.payments.find((payment) =>
      ['authorized', 'partially_refunded'].includes(payment.status),
    );
    const refunded = order.refunds
      .filter((refund) => refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amountClp, 0);
    return {
      ...summary,
      buyer: order.user,
      payments: order.payments.map((payment) => ({
        provider: payment.provider,
        buyOrder: payment.buyOrder,
        amountClp: payment.amountClp,
        status: payment.status,
        authorizationCode: payment.authorizationCode,
        cardLast4: payment.cardLast4,
        paymentType: payment.paymentType,
        installments: payment.installments,
        confirmedAt: payment.confirmedAt?.toISOString() ?? null,
        createdAt: payment.createdAt.toISOString(),
      })),
      refunds: order.refunds.map((refund) => ({
        id: refund.id,
        amountClp: refund.amountClp,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
        completedAt: refund.completedAt?.toISOString() ?? null,
      })),
      history: order.statusHistory.map((change) => ({
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        reason: change.reason,
        createdAt: change.createdAt.toISOString(),
      })),
      refundableClp:
        paid && REFUNDABLE_ORDER_STATUSES.includes(order.status) ? paid.amountClp - refunded : 0,
    };
  }

  async refund(
    number: string,
    input: RefundRequest,
    idempotencyKey: string,
    actor: AuditActor,
  ): Promise<AdminOrder> {
    const { prisma, gateway, audit } = this.options;

    const existing = await prisma.refund.findUnique({ where: { idempotencyKey } });
    if (existing) return this.adminOrder(number);

    const { order, payment, refund, previous, alreadyRefunded } = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE number = ${number} FOR UPDATE`;
        const order = await tx.order.findUnique({
          where: { number },
          include: { payments: true, refunds: true },
        });
        if (!order) throw AppError.notFound(NOT_FOUND);
        const payment = order.payments.find((item) =>
          ['authorized', 'partially_refunded'].includes(item.status),
        );
        if (!REFUNDABLE_ORDER_STATUSES.includes(order.status) || !payment?.token) {
          throw AppError.conflict(
            'ORDER_NOT_REFUNDABLE',
            'Esta orden no tiene un pago que se pueda devolver.',
          );
        }
        const alreadyRefunded = order.refunds
          .filter((item) => item.status !== 'failed')
          .reduce((sum, item) => sum + item.amountClp, 0);
        const available = payment.amountClp - alreadyRefunded;
        if (input.amountClp > available) {
          throw AppError.conflict(
            'REFUND_EXCEEDS_PAYMENT',
            'El monto supera lo que queda por devolver de esta orden.',
          );
        }
        const previous = order.status;
        await transitionOrder(tx, order.id, previous, 'refund_requested', input.reason);
        const refund = await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amountClp: input.amountClp,
            status: 'processing',
            reason: input.reason,
            idempotencyKey,
            ...(actor.actorId ? { requestedById: actor.actorId } : {}),
          },
        });
        return { order, payment, refund, previous, alreadyRefunded };
      },
    );

    let result: Awaited<ReturnType<PaymentGateway['refund']>>;
    try {
      result = await gateway.refund({ token: payment.token ?? '', amount: input.amountClp });
    } catch {
      await prisma.$transaction(async (tx) => {
        await tx.refund.update({ where: { id: refund.id }, data: { status: 'failed' } });
        await transitionOrder(
          tx,
          order.id,
          'refund_requested',
          previous === 'paid' ? 'paid' : 'partially_refunded',
          'La pasarela rechazó la devolución',
        );
        await audit.record(
          {
            ...actor,
            action: 'refund.failed',
            entityType: 'refund',
            entityId: refund.id,
            after: { order: number, amountClp: input.amountClp },
          },
          tx,
        );
      });
      throw new AppError(
        502,
        'REFUND_FAILED',
        'La pasarela no aceptó la devolución. Revisa el estado del pago antes de reintentar.',
      );
    }

    const total = alreadyRefunded + input.amountClp === payment.amountClp;
    const now = this.now();
    const editionIds = await prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: 'completed',
          completedAt: now,
          providerResponse: JSON.parse(JSON.stringify(result.raw)),
        },
      });
      await transitionPayment(
        tx,
        payment.id,
        payment.status,
        total ? 'refunded' : 'partially_refunded',
      );
      await transitionOrder(
        tx,
        order.id,
        'refund_requested',
        total ? 'refunded' : 'partially_refunded',
        total ? 'Devolución total' : 'Devolución parcial',
      );
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { id: true, editionId: true },
      });
      if (total) {
        await tx.enrollment.updateMany({
          where: {
            orderItemId: { in: items.map((item) => item.id) },
            status: { in: ['pending_lms', 'enrolled', 'failed'] },
          },
          data: { status: 'withdrawn', withdrawnAt: now },
        });
      }
      await audit.record(
        {
          ...actor,
          action: 'refund.completed',
          entityType: 'refund',
          entityId: refund.id,
          after: {
            order: number,
            amountClp: input.amountClp,
            total,
            type: result.type,
            reason: input.reason,
          },
        },
        tx,
      );
      return total ? items.map((item) => item.editionId) : [];
    });
    await this.options.cache.delete(editionIds.map((id) => catalogCacheKeys.seats(id)));
    return this.adminOrder(number);
  }
}
