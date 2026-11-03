import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { MockInvoicingGateway } from './mock.js';
import type { SalesDocumentInput } from './port.js';

const boleta: SalesDocumentInput = {
  orderId: 'order-1',
  type: 'boleta',
  issuedAt: new Date('2026-11-03T12:00:00Z'),
  totalAmount: 59_980,
  receiver: { name: 'Comprador de Prueba' },
  lines: [{ description: 'Curso Excel', quantity: 2, unitAmount: 29_990, taxTreatment: 'exempt' }],
};

describe('MockInvoicingGateway', () => {
  it('issues a document with a folio and is idempotent per order', async () => {
    const invoicing = new MockInvoicingGateway();
    const first = await invoicing.submit(boleta);
    expect(first).toMatchObject({ status: 'issued', folio: '1' });
    expect(await invoicing.submit(boleta)).toEqual(first);
    expect(await invoicing.getStatus(first.externalId ?? '')).toEqual(first);
  });

  it('requires tax data for a factura', async () => {
    const invoicing = new MockInvoicingGateway();
    await expect(
      invoicing.submit({ ...boleta, orderId: 'order-2', type: 'factura' }),
    ).rejects.toBeInstanceOf(IntegrationError);
  });

  it('rejects documents whose lines do not add up to the total', async () => {
    const invoicing = new MockInvoicingGateway();
    await expect(
      invoicing.submit({ ...boleta, orderId: 'order-3', totalAmount: 1 }),
    ).rejects.toBeInstanceOf(IntegrationError);
  });
});
