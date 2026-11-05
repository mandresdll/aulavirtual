import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildReceiptPdf, type ReceiptData } from './receipts.service.js';

const provider = {
  name: 'Centro de Formación Técnica Estatal de Magallanes',
  rut: 'Por confirmar',
  address: 'Punta Arenas',
  email: 'uta@example.cl',
  phone: '+56 61 000 0000',
};

const data: ReceiptData = {
  number: 'UTA-2026-000001',
  buyerName: 'María Ñancupil',
  paidAt: new Date('2026-06-01T15:00:00Z'),
  documentType: 'receipt',
  couponCode: 'BECA',
  subtotalClp: 89_000,
  discountClp: 8_900,
  totalClp: 80_100,
  lines: [{ title: 'Programación web', totalClp: 80_100, taxTreatment: 'exempt' }],
  payment: { authorizationCode: '1213', cardLast4: '6623', paymentType: 'VN' },
};

describe('buildReceiptPdf', () => {
  it('generates a one-page PDF with Spanish accents', async () => {
    const pdf = await buildReceiptPdf(data, provider);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('Comprobante UTA-2026-000001');
  });

  it('does not fail with characters the PDF font cannot encode', async () => {
    const pdf = await buildReceiptPdf(
      { ...data, buyerName: 'Nombre 名前 🎓', payment: null, couponCode: null },
      provider,
    );
    expect(pdf.length).toBeGreaterThan(500);
  });
});
