import { randomBytes } from 'node:crypto';
import { IntegrationError } from '../errors.js';
import type {
  CreateTransactionInput,
  CreatedTransaction,
  PaymentGateway,
  RefundInput,
  RefundResult,
  TransactionDetails,
} from './port.js';

export type MockPaymentOutcome = 'approved' | 'rejected';

interface MockTransaction {
  input: CreateTransactionInput;
  outcome: MockPaymentOutcome;
  details: TransactionDetails | null;
  refunded: number;
}

/**
 * Pasarela simulada para desarrollo y pruebas. Imita las reglas de Webpay Plus que importan
 * a la plataforma: confirmar dos veces falla, montos de devolución acotados y estados finales.
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly provider = 'mock';
  private readonly transactions = new Map<string, MockTransaction>();

  constructor(private readonly options: { redirectBaseUrl: string }) {}

  /** Define cómo terminará el pago cuando el comprador vuelva de la pasarela. */
  simulate(token: string, outcome: MockPaymentOutcome): void {
    this.get(token).outcome = outcome;
  }

  async createTransaction(input: CreateTransactionInput): Promise<CreatedTransaction> {
    if (input.amount <= 0) {
      throw new IntegrationError('payment-gateway', 'INVALID_AMOUNT', 'Amount must be positive');
    }
    const token = randomBytes(32).toString('hex');
    this.transactions.set(token, { input, outcome: 'approved', details: null, refunded: 0 });
    const redirectUrl = new URL('/api/dev/mock-payment', this.options.redirectBaseUrl);
    redirectUrl.searchParams.set('token', token);
    return { token, redirectUrl: redirectUrl.toString() };
  }

  async commit(token: string): Promise<TransactionDetails> {
    const transaction = this.get(token);
    if (transaction.details) {
      throw new IntegrationError(
        'payment-gateway',
        'ALREADY_COMMITTED',
        'Transaction already committed',
      );
    }
    const approved = transaction.outcome === 'approved';
    transaction.details = {
      token,
      buyOrder: transaction.input.buyOrder,
      amount: transaction.input.amount,
      status: approved ? 'authorized' : 'failed',
      responseCode: approved ? 0 : -1,
      transactionDate: new Date(),
      ...(approved ? { authorizationCode: '1213', cardLast4: '6623', paymentType: 'VN' } : {}),
      installments: 0,
      raw: { mock: true, outcome: transaction.outcome },
    };
    return transaction.details;
  }

  async getStatus(token: string): Promise<TransactionDetails> {
    const transaction = this.get(token);
    return (
      transaction.details ?? {
        token,
        buyOrder: transaction.input.buyOrder,
        amount: transaction.input.amount,
        status: 'initialized',
        raw: { mock: true },
      }
    );
  }

  async refund({ token, amount }: RefundInput): Promise<RefundResult> {
    const transaction = this.get(token);
    const details = transaction.details;
    if (!details || !['authorized', 'partially_nullified'].includes(details.status)) {
      throw new IntegrationError('payment-gateway', 'NOT_REFUNDABLE', 'Transaction not refundable');
    }
    const available = details.amount - transaction.refunded;
    if (amount <= 0 || amount > available) {
      throw new IntegrationError('payment-gateway', 'INVALID_AMOUNT', 'Invalid refund amount');
    }
    transaction.refunded += amount;
    const full = transaction.refunded === details.amount;
    const firstFullRefund = full && amount === details.amount;
    details.status = full ? (firstFullRefund ? 'reversed' : 'nullified') : 'partially_nullified';
    return {
      type: firstFullRefund ? 'reversed' : 'nullified',
      amount,
      authorizationCode: '123456',
      raw: { mock: true },
    };
  }

  private get(token: string): MockTransaction {
    const transaction = this.transactions.get(token);
    if (!transaction) {
      throw new IntegrationError('payment-gateway', 'NOT_FOUND', 'Unknown transaction token');
    }
    return transaction;
  }
}
