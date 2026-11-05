import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildCertificatePdf, sha256Hex, type CertificatePdfData } from './certificate-pdf.js';

const provider = {
  name: 'Centro de Formación Técnica Estatal de Magallanes',
  rut: 'Por confirmar',
  address: 'Punta Arenas',
  email: 'uta@example.cl',
  phone: '+56 61 000 0000',
};

const data: CertificatePdfData = {
  code: 'ABCD-EFGH-JKMN',
  recipientName: 'María José Ñancupil',
  courseTitle: 'Programación web con JavaScript',
  hours: 40,
  startsAt: new Date('2026-06-01T12:00:00Z'),
  endsAt: new Date('2026-07-01T12:00:00Z'),
  issuedAt: new Date('2026-07-05T12:00:00Z'),
  verificationUrl: 'https://cursos.example.cl/verificar/ABCD-EFGH-JKMN',
};

describe('buildCertificatePdf', () => {
  it('generates one landscape page with the code in its title', async () => {
    const pdf = await buildCertificatePdf(data, provider);
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('Certificado ABCD-EFGH-JKMN');
    const { width, height } = document.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it('is deterministic, so a regenerated PDF matches the stored hash', async () => {
    const first = sha256Hex(await buildCertificatePdf(data, provider));
    const second = sha256Hex(await buildCertificatePdf(data, provider));
    expect(second).toBe(first);
    const other = await buildCertificatePdf({ ...data, recipientName: 'Otra Persona' }, provider);
    expect(sha256Hex(other)).not.toBe(first);
  });

  it('fits very long names and survives characters the font cannot encode', async () => {
    const pdf = await buildCertificatePdf(
      { ...data, recipientName: `${'Nombre muy largo '.repeat(12)} 名前 🎓` },
      provider,
    );
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
