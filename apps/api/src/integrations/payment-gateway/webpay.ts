import { Options, WebpayPlus } from 'transbank-sdk';
import { IntegrationError } from '../errors.js';
import type {
  CreateTransactionInput,
  CreatedTransaction,
  PaymentGateway,
  PaymentTransactionStatus,
  RefundInput,
  RefundResult,
  TransactionDetails,
} from './port.js';

export interface WebpayConfig {
  environment: 'integration' | 'production';
  commerceCode: string;
  apiKey: string;
  /** Solo pruebas: reemplaza la URL de Transbank por un servidor falso. */
  baseUrl?: string;
  timeoutMs?: number;
}

const BASE_URLS = {
  integration: 'https://webpay3gint.transbank.cl',
  production: 'https://webpay3g.transbank.cl',
} as const;

const STATUSES: Record<string, PaymentTransactionStatus> = {
  INITIALIZED: 'initialized',
  AUTHORIZED: 'authorized',
  FAILED: 'failed',
  REVERSED: 'reversed',
  NULLIFIED: 'nullified',
  PARTIALLY_NULLIFIED: 'partially_nullified',
};

interface WebpayResponse {
  status?: string;
  amount?: number;
  buy_order?: string;
  authorization_code?: string;
  payment_type_code?: string;
  response_code?: number;
  installments_number?: number;
  transaction_date?: string;
  card_detail?: { card_number?: string };
}

/**
 * Adaptador Transbank Webpay Plus (`transbank-sdk`, Q1). El comprador paga en Webpay: la
 * plataforma solo recibe el token. `commit` concreta el cobro y no se puede repetir; ante un
 * error de red se consulta `getStatus`. Un 4xx de Transbank es definitivo; el resto se reintenta.
 */
export class WebpayPaymentGateway implements PaymentGateway {
  readonly provider = 'webpay';
  private readonly transaction: InstanceType<typeof WebpayPlus.Transaction>;

  constructor(readonly config: WebpayConfig) {
    this.transaction = new WebpayPlus.Transaction(
      new Options(
        config.commerceCode,
        config.apiKey,
        config.baseUrl ?? BASE_URLS[config.environment],
        config.timeoutMs ?? 15_000,
      ),
    );
  }

  async createTransaction(input: CreateTransactionInput): Promise<CreatedTransaction> {
    const response = (await this.call('CREATE_FAILED', () =>
      this.transaction.create(input.buyOrder, input.sessionId, input.amount, input.returnUrl),
    )) as { token: string; url: string };
    return {
      token: response.token,
      redirectUrl: response.url,
      formFields: { token_ws: response.token },
    };
  }

  async commit(token: string): Promise<TransactionDetails> {
    return this.toDetails(
      token,
      (await this.call('COMMIT_FAILED', () => this.transaction.commit(token))) as WebpayResponse,
    );
  }

  async getStatus(token: string): Promise<TransactionDetails> {
    return this.toDetails(
      token,
      (await this.call('STATUS_FAILED', () => this.transaction.status(token))) as WebpayResponse,
    );
  }

  async refund({ token, amount }: RefundInput): Promise<RefundResult> {
    const response = (await this.call('REFUND_FAILED', () =>
      this.transaction.refund(token, amount),
    )) as { type?: string; authorization_code?: string };
    return {
      type: response.type === 'REVERSED' ? 'reversed' : 'nullified',
      amount,
      ...(response.authorization_code ? { authorizationCode: response.authorization_code } : {}),
      raw: { ...response },
    };
  }

  private async call(code: string, request: () => Promise<unknown>): Promise<unknown> {
    try {
      return await request();
    } catch (error) {
      const definitive = error instanceof Error && /status code 4\d\d/.test(error.message);
      throw new IntegrationError('payment-gateway', code, 'Webpay request failed', !definitive, {
        cause: error,
      });
    }
  }

  private toDetails(token: string, response: WebpayResponse): TransactionDetails {
    const status = STATUSES[response.status ?? ''];
    if (!status) {
      throw new IntegrationError('payment-gateway', 'UNKNOWN_STATUS', 'Unknown Webpay status');
    }
    const last4 = response.card_detail?.card_number?.slice(-4);
    return {
      token,
      buyOrder: response.buy_order ?? '',
      amount: response.amount ?? 0,
      status,
      ...(response.authorization_code ? { authorizationCode: response.authorization_code } : {}),
      ...(last4 ? { cardLast4: last4 } : {}),
      ...(response.payment_type_code ? { paymentType: response.payment_type_code } : {}),
      ...(response.installments_number !== undefined
        ? { installments: response.installments_number }
        : {}),
      ...(response.response_code !== undefined ? { responseCode: response.response_code } : {}),
      ...(response.transaction_date
        ? { transactionDate: new Date(response.transaction_date) }
        : {}),
      // Webpay solo entrega los últimos 4 dígitos; se recorta igual por seguridad.
      raw: { ...response, ...(last4 ? { card_detail: { card_number: last4 } } : {}) },
    };
  }
}
