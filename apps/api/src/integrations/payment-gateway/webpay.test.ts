import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { paymentGatewayContract } from './payment-gateway.contract.js';
import { WebpayPaymentGateway, type WebpayConfig } from './webpay.js';

/**
 * Webpay Plus falso con las reglas de Transbank: credenciales por cabecera, un solo commit y
 * devoluciones acotadas. Permite ejecutar el contrato sin red. El adaptador real también debe
 * pasarlo contra el ambiente de integración de Transbank.
 */
const COMMERCE = '597055555532';
const SECRET = 'fake-secret';

interface FakeTransaction {
  buyOrder: string;
  amount: number;
  outcome: 'approved' | 'rejected';
  committed: boolean;
  refunded: number;
  status: string;
}

const transactions = new Map<string, FakeTransaction>();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (
      request.headers['tbk-api-key-id'] !== COMMERCE ||
      request.headers['tbk-api-key-secret'] !== SECRET
    ) {
      send(401, { error_message: 'Not Authorized' });
      return;
    }
    let raw = '';
    request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    request.on('end', () => {
      const body = (raw ? JSON.parse(raw) : {}) as { buy_order: string; amount: number };
      const match = /\/transactions(?:\/([^/]+))?(\/refunds)?$/.exec(request.url ?? '');
      if (!match) return send(404, {});
      const token = match[1];
      if (!token) {
        const created = randomBytes(32).toString('hex');
        transactions.set(created, {
          buyOrder: body.buy_order,
          amount: body.amount,
          outcome: 'approved',
          committed: false,
          refunded: 0,
          status: 'INITIALIZED',
        });
        return send(200, { token: created, url: `${baseUrl}/webpayserver/initTransaction` });
      }
      const transaction = transactions.get(token);
      if (!transaction) return send(422, { error_message: 'Invalid token' });

      if (match[2]) {
        if (body.amount > transaction.amount - transaction.refunded) {
          return send(422, { error_message: 'Invalid amount' });
        }
        transaction.refunded += body.amount;
        const full = transaction.refunded === transaction.amount;
        const first = full && body.amount === transaction.amount;
        transaction.status = full ? (first ? 'REVERSED' : 'NULLIFIED') : 'PARTIALLY_NULLIFIED';
        return send(
          200,
          first ? { type: 'REVERSED' } : { type: 'NULLIFIED', authorization_code: '123456' },
        );
      }
      if (request.method === 'PUT') {
        if (transaction.committed) return send(422, { error_message: 'Already committed' });
        transaction.committed = true;
        transaction.status = transaction.outcome === 'approved' ? 'AUTHORIZED' : 'FAILED';
      }
      const failed = transaction.status === 'FAILED';
      return send(200, {
        vci: 'TSY',
        amount: transaction.amount,
        status: transaction.status,
        buy_order: transaction.buyOrder,
        session_id: 'session-1',
        card_detail: { card_number: '6623' },
        transaction_date: '2026-06-01T12:00:00.000Z',
        authorization_code: failed ? '000000' : '1213',
        payment_type_code: 'VN',
        response_code: failed ? -1 : 0,
        installments_number: 0,
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const gateway = (overrides: Partial<WebpayConfig> = {}) =>
  new WebpayPaymentGateway({
    environment: 'integration',
    commerceCode: COMMERCE,
    apiKey: SECRET,
    baseUrl,
    ...overrides,
  });

paymentGatewayContract('webpay (fake Transbank)', () => ({
  gateway: gateway(),
  completePayment: async (token, outcome) => {
    const transaction = transactions.get(token);
    if (transaction) transaction.outcome = outcome;
  },
}));

describe('WebpayPaymentGateway', () => {
  const input = {
    buyOrder: 'UTA-2026-000001-1',
    sessionId: 'session-1',
    amount: 45_000,
    returnUrl: 'https://cursos.example.cl/api/payments/return',
  };

  it('sends the buyer to Webpay by POST with token_ws', async () => {
    const created = await gateway().createTransaction(input);
    expect(created.redirectUrl).toBe(`${baseUrl}/webpayserver/initTransaction`);
    expect(created.formFields).toEqual({ token_ws: created.token });
  });

  it('maps the commit response keeping only the last 4 digits', async () => {
    const created = await gateway().createTransaction(input);
    expect(await gateway().commit(created.token)).toMatchObject({
      status: 'authorized',
      buyOrder: input.buyOrder,
      amount: 45_000,
      authorizationCode: '1213',
      cardLast4: '6623',
      paymentType: 'VN',
      installments: 0,
      responseCode: 0,
    });
  });

  it('treats rejected credentials as definitive and network errors as retryable', async () => {
    await expect(gateway({ apiKey: 'otra' }).createTransaction(input)).rejects.toMatchObject({
      code: 'CREATE_FAILED',
      retryable: false,
    });
    await expect(
      gateway({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 500 }).createTransaction(input),
    ).rejects.toMatchObject({ retryable: true });
    await expect(gateway().getStatus('x'.repeat(64))).rejects.toBeInstanceOf(IntegrationError);
  });
});
