import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { HttpInvoicingGateway } from './http.js';
import type { SalesDocumentInput } from './port.js';

const document: SalesDocumentInput = {
  orderId: 'order-1',
  type: 'boleta',
  issuedAt: new Date('2026-06-01T12:00:00Z'),
  totalAmount: 1000,
  receiver: { name: 'Ana Soto' },
  lines: [{ description: 'Excel', quantity: 1, unitAmount: 1000, taxTreatment: 'affected' }],
};

function gateway(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const instance = new HttpInvoicingGateway({
    baseUrl: 'https://boletas.example.cl/api',
    token: 'service-token',
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(body), { status });
    },
  });
  return { instance, calls };
}

describe('HttpInvoicingGateway', () => {
  it('sends the document with token and idempotency key, and reads the folio', async () => {
    const { instance, calls } = gateway(201, { externalId: 'x1', status: 'issued', folio: '55' });
    expect(await instance.submit(document)).toEqual({
      status: 'issued',
      externalId: 'x1',
      folio: '55',
    });
    expect(calls[0]?.url).toBe('https://boletas.example.cl/api/documents');
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: 'Bearer service-token',
      'Idempotency-Key': 'order-1',
    });
  });

  it('treats 409 as already received', async () => {
    const { instance } = gateway(409, { externalId: 'x1', status: 'pending' });
    expect(await instance.submit(document)).toEqual({ status: 'pending', externalId: 'x1' });
  });

  it('asks for the status of a document', async () => {
    const { instance, calls } = gateway(200, { externalId: 'a/b', status: 'rejected' });
    expect((await instance.getStatus('a/b')).status).toBe('rejected');
    expect(calls[0]?.url).toBe('https://boletas.example.cl/api/documents/a%2Fb');
  });

  it('retries server errors but not rejected requests', async () => {
    const down = gateway(503, {}).instance.submit(document);
    await expect(down).rejects.toMatchObject({ retryable: true });
    const bad = gateway(422, {}).instance.submit(document);
    await expect(bad).rejects.toMatchObject({ retryable: false });
  });

  it('does not accept a response outside the contract', async () => {
    await expect(gateway(200, { ok: true }).instance.submit(document)).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });
});
