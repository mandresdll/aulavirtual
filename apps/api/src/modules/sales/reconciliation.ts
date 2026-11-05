import type { DiscrepancyKind } from '@plataforma/shared';
import type { PaymentTransactionStatus } from '../../integrations/payment-gateway/port.js';

const CHARGED: readonly PaymentTransactionStatus[] = ['authorized', 'partially_nullified'];

/** Estados de la pasarela que corresponden a cada estado local con cobro o devolución. */
const EXPECTED: Record<string, readonly PaymentTransactionStatus[]> = {
  authorized: ['authorized'],
  partially_refunded: ['partially_nullified'],
  refunded: ['reversed', 'nullified'],
};

/**
 * Compara un pago con la pasarela. Un pago sin cobro local (rechazado, abortado o abandonado) solo
 * es una diferencia si la pasarela sí lo cobró. `confirming` se excluye antes: sigue en curso.
 */
export function compareTransaction(
  local: { status: string; amountClp: number },
  gateway: { status: PaymentTransactionStatus; amount: number },
): DiscrepancyKind[] {
  const kinds: DiscrepancyKind[] = [];
  const expected = EXPECTED[local.status];
  const matches = expected ? expected.includes(gateway.status) : !CHARGED.includes(gateway.status);
  if (!matches) kinds.push('status_mismatch');
  if (gateway.amount !== local.amountClp) kinds.push('amount_mismatch');
  return kinds;
}
