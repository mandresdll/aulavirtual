import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import type { PaymentGateway } from './port.js';

export interface PaymentGatewayHarness {
  gateway: PaymentGateway;
  /** Lleva la transacción al punto en que el comprador vuelve de la pasarela. */
  completePayment(token: string, outcome: 'approved' | 'rejected'): Promise<void>;
}

/**
 * Contrato que todo adaptador de pasarela debe cumplir. El adaptador real lo ejecuta
 * contra el ambiente de integración del proveedor.
 */
export function paymentGatewayContract(name: string, setup: () => PaymentGatewayHarness) {
  describe(`PaymentGateway contract: ${name}`, () => {
    const input = (amount = 49_990) => ({
      buyOrder: `ORD-${Date.now()}`,
      sessionId: 'session-1',
      amount,
      returnUrl: 'http://localhost:3000/api/payments/return',
    });

    it('creates a transaction with a token and an absolute redirect URL', async () => {
      const { gateway } = setup();
      const created = await gateway.createTransaction(input());
      expect(created.token).toMatch(/\S{10,}/);
      expect(() => new URL(created.redirectUrl)).not.toThrow();
      expect((await gateway.getStatus(created.token)).status).toBe('initialized');
    });

    it('authorizes an approved payment and reports the amount', async () => {
      const harness = setup();
      const created = await harness.gateway.createTransaction(input());
      await harness.completePayment(created.token, 'approved');
      const details = await harness.gateway.commit(created.token);
      expect(details).toMatchObject({ status: 'authorized', amount: 49_990 });
      expect(details.authorizationCode).toBeTruthy();
      expect(details.cardLast4 ?? '').toMatch(/^(\d{4})?$/);
    });

    it('marks a rejected payment as failed', async () => {
      const harness = setup();
      const created = await harness.gateway.createTransaction(input());
      await harness.completePayment(created.token, 'rejected');
      expect((await harness.gateway.commit(created.token)).status).toBe('failed');
    });

    it('rejects a second commit of the same token', async () => {
      const harness = setup();
      const created = await harness.gateway.createTransaction(input());
      await harness.completePayment(created.token, 'approved');
      await harness.gateway.commit(created.token);
      await expect(harness.gateway.commit(created.token)).rejects.toBeInstanceOf(IntegrationError);
      expect((await harness.gateway.getStatus(created.token)).status).toBe('authorized');
    });

    it('refunds partially and then the remainder, never more than paid', async () => {
      const harness = setup();
      const created = await harness.gateway.createTransaction(input(10_000));
      await harness.completePayment(created.token, 'approved');
      await harness.gateway.commit(created.token);

      await harness.gateway.refund({ token: created.token, amount: 4_000 });
      expect((await harness.gateway.getStatus(created.token)).status).toBe('partially_nullified');
      await expect(
        harness.gateway.refund({ token: created.token, amount: 7_000 }),
      ).rejects.toBeInstanceOf(IntegrationError);
      await harness.gateway.refund({ token: created.token, amount: 6_000 });
      expect((await harness.gateway.getStatus(created.token)).status).toBe('nullified');
    });

    it('fails on unknown tokens', async () => {
      const { gateway } = setup();
      await expect(gateway.getStatus('unknown-token-0000')).rejects.toBeInstanceOf(
        IntegrationError,
      );
    });
  });
}
