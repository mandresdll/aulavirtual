import type { ClpAmount } from '@plataforma/shared';

/**
 * Puerto de la pasarela de pagos (RF-03). Flujo de redirección: la plataforma nunca
 * recibe datos de tarjeta. Supuesto por defecto (Q1): Transbank Webpay Plus.
 */
export type PaymentTransactionStatus =
  'initialized' | 'authorized' | 'failed' | 'reversed' | 'nullified' | 'partially_nullified';

export interface CreateTransactionInput {
  /** Identificador único de la orden en la pasarela (máx. 26 caracteres en Webpay). */
  buyOrder: string;
  sessionId: string;
  amount: ClpAmount;
  returnUrl: string;
}

export interface CreatedTransaction {
  token: string;
  /** URL a la que se redirige al comprador para pagar. */
  redirectUrl: string;
}

export interface TransactionDetails {
  token: string;
  buyOrder: string;
  amount: ClpAmount;
  status: PaymentTransactionStatus;
  authorizationCode?: string;
  /** Solo los últimos 4 dígitos, tal como los entrega la pasarela. */
  cardLast4?: string;
  paymentType?: string;
  installments?: number;
  responseCode?: number;
  transactionDate?: Date;
  /** Respuesta del proveedor sin datos sensibles, para trazabilidad. */
  raw: Record<string, unknown>;
}

export interface RefundInput {
  token: string;
  amount: ClpAmount;
}

export interface RefundResult {
  type: 'reversed' | 'nullified';
  amount: ClpAmount;
  authorizationCode?: string;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly provider: string;
  createTransaction(input: CreateTransactionInput): Promise<CreatedTransaction>;
  /** Confirma la transacción en la pasarela al volver el comprador. No es idempotente en Webpay. */
  commit(token: string): Promise<TransactionDetails>;
  getStatus(token: string): Promise<TransactionDetails>;
  refund(input: RefundInput): Promise<RefundResult>;
}
