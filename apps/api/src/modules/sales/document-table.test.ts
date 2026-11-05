import { describe, expect, it } from 'vitest';
import { documentsTable, splitTax, type DocumentRecord } from './document-table.js';

const record: DocumentRecord = {
  folio: '77',
  type: 'invoice',
  status: 'issued',
  paidAt: new Date('2026-06-01T02:00:00Z'),
  orderNumber: 'UTA-2026-000001',
  receiverRut: '76.000.000-0',
  receiverName: 'Empresa SpA',
  receiverActivity: 'Servicios',
  receiverAddress: 'Punta Arenas',
  receiverEmail: 'pagos@example.cl',
  lines: [
    { courseTitle: 'Excel', totalClp: 119_000, taxTreatment: 'taxed' },
    { courseTitle: 'Word', totalClp: 50_000, taxTreatment: 'exempt' },
  ],
  refundedClp: 0,
};

describe('splitTax', () => {
  it('separates net, VAT and exempt amounts that add up to the total', () => {
    expect(splitTax(record.lines, 19)).toEqual({
      net: 100_000,
      vat: 19_000,
      exempt: 50_000,
      total: 169_000,
    });
  });

  it('never loses a peso to rounding', () => {
    const { net, vat } = splitTax(
      [{ courseTitle: 'A', totalClp: 9_999, taxTreatment: 'taxed' }],
      19,
    );
    expect(net + vat).toBe(9_999);
  });
});

describe('documentsTable', () => {
  it('uses the configured columns in their order', () => {
    const table = documentsTable([record], ['orden', 'tipo', 'total', 'fecha'], 19);
    expect(table.headers).toEqual(['Orden', 'Tipo', 'Total', 'Fecha de pago']);
    // 02:00 UTC del 1 de junio sigue siendo 31 de mayo en Punta Arenas.
    expect(table.rows).toEqual([['UTA-2026-000001', 'Factura', 169_000, '2026-05-31']]);
  });
});
