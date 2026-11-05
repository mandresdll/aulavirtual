import { ORDER_STATUSES, PAYMENT_STATUSES } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';
import {
  canTransitionOrder,
  canTransitionPayment,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
} from './state-machine.js';

describe('order state machine', () => {
  it('allows exactly the listed transitions', () => {
    const allowed = ORDER_STATUSES.flatMap((from) =>
      ORDER_STATUSES.filter((to) => canTransitionOrder(from, to)).map((to) => `${from}>${to}`),
    );
    expect(allowed.sort()).toEqual(
      [
        'pending>awaiting_payment',
        'pending>paid',
        'awaiting_payment>paid',
        'awaiting_payment>failed',
        'awaiting_payment>cancelled',
        'paid>refund_requested',
        'refund_requested>refunded',
        'refund_requested>partially_refunded',
        'refund_requested>paid',
        'partially_refunded>refund_requested',
      ].sort(),
    );
  });

  it('never leaves a final state', () => {
    for (const status of ['refunded', 'failed', 'cancelled'] as const) {
      expect(ORDER_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('cannot pay an order twice or revive a cancelled one', () => {
    expect(canTransitionOrder('paid', 'paid')).toBe(false);
    expect(canTransitionOrder('cancelled', 'paid')).toBe(false);
    expect(canTransitionOrder('failed', 'awaiting_payment')).toBe(false);
  });
});

describe('payment state machine', () => {
  it('only reaches authorized through the server-side confirmation', () => {
    const into = PAYMENT_STATUSES.filter((from) => canTransitionPayment(from, 'authorized'));
    expect(into).toEqual(['confirming']);
  });

  it('never leaves rejected, aborted, failed or refunded', () => {
    for (const status of ['rejected', 'aborted', 'failed', 'refunded'] as const) {
      expect(PAYMENT_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('does not refund a payment that was not authorized', () => {
    expect(canTransitionPayment('created', 'refunded')).toBe(false);
    expect(canTransitionPayment('rejected', 'partially_refunded')).toBe(false);
    expect(canTransitionPayment('authorized', 'refunded')).toBe(true);
  });
});
