import type { OrderStatus, PaymentStatus } from '@plataforma/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

/** Máquinas de estado de órdenes y pagos (regla 9). Una transición no listada es un error. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['awaiting_payment', 'paid'],
  awaiting_payment: ['paid', 'failed', 'cancelled'],
  paid: ['refund_requested'],
  // Si la pasarela rechaza la devolución, la orden vuelve a `paid` o `partially_refunded`.
  refund_requested: ['refunded', 'partially_refunded', 'paid'],
  partially_refunded: ['refund_requested'],
  refunded: [],
  failed: [],
  cancelled: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ['confirming', 'aborted', 'failed'],
  confirming: ['authorized', 'rejected', 'failed'],
  authorized: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded'],
  refunded: [],
  rejected: [],
  aborted: [],
  failed: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

const staleState = () =>
  AppError.conflict(
    'STATE_CONFLICT',
    'El estado de la orden cambió mientras se procesaba. Recarga la página.',
  );

/**
 * Cambia el estado de la orden solo si sigue en `from` (actualización condicional: dos procesos
 * no pueden aplicar la misma transición) y deja el cambio en el historial.
 */
export async function transitionOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  reason: string,
  data: Prisma.OrderUpdateManyMutationInput = {},
): Promise<void> {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid order transition ${from} -> ${to}`);
  }
  const updated = await tx.order.updateMany({
    where: { id: orderId, status: from },
    data: { ...data, status: to },
  });
  if (updated.count === 0) throw staleState();
  await tx.orderStatusChange.create({
    data: { orderId, fromStatus: from, toStatus: to, reason },
  });
}

/** Igual que `transitionOrder` para un pago. Devuelve si la transición se aplicó. */
export async function transitionPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  from: PaymentStatus,
  to: PaymentStatus,
  data: Prisma.PaymentUpdateManyMutationInput = {},
): Promise<boolean> {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Invalid payment transition ${from} -> ${to}`);
  }
  const updated = await tx.payment.updateMany({
    where: { id: paymentId, status: from },
    data: { ...data, status: to },
  });
  return updated.count === 1;
}

/**
 * Suelta lo que retiene una orden que no se pagará: reservas de cupos y el uso del cupón.
 * Se ejecuta en la transacción que lleva la orden a `failed` o `cancelled`.
 */
export async function releaseOrderHold(
  tx: Prisma.TransactionClient,
  orderId: string,
  reservationStatus: 'released' | 'expired',
): Promise<void> {
  await tx.seatReservation.updateMany({
    where: { orderId, status: 'active' },
    data: { status: reservationStatus },
  });
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (redemption) {
    await tx.coupon.update({
      where: { id: redemption.couponId },
      data: { usesCount: { decrement: 1 } },
    });
  }
}
