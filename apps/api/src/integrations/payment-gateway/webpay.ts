import { AdapterNotImplementedError } from '../errors.js';
import type {
  CreateTransactionInput,
  CreatedTransaction,
  PaymentGateway,
  RefundInput,
  RefundResult,
  TransactionDetails,
} from './port.js';

export interface WebpayConfig {
  environment: 'integration' | 'production';
  commerceCode: string;
  apiKey: string;
}

/**
 * Adaptador Transbank Webpay Plus (`transbank-sdk`). Se implementa en la Fase 4.
 */
export class WebpayPaymentGateway implements PaymentGateway {
  readonly provider = 'webpay';

  constructor(readonly config: WebpayConfig) {}

  async createTransaction(_input: CreateTransactionInput): Promise<CreatedTransaction> {
    throw new AdapterNotImplementedError(
      'payment-gateway',
      'Webpay Plus se implementa en la Fase 4',
    );
  }

  async commit(_token: string): Promise<TransactionDetails> {
    throw new AdapterNotImplementedError(
      'payment-gateway',
      'Webpay Plus se implementa en la Fase 4',
    );
  }

  async getStatus(_token: string): Promise<TransactionDetails> {
    throw new AdapterNotImplementedError(
      'payment-gateway',
      'Webpay Plus se implementa en la Fase 4',
    );
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new AdapterNotImplementedError(
      'payment-gateway',
      'Webpay Plus se implementa en la Fase 4',
    );
  }
}
