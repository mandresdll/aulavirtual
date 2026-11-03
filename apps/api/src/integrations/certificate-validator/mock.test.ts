import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { MockCertificateValidator } from './mock.js';

const certificate = {
  code: 'K7M2-P9QX-4TZA',
  holderName: 'Estudiante de Prueba',
  courseTitle: 'Excel intermedio',
  hours: 24,
  issuedAt: new Date('2026-11-03T12:00:00Z'),
  verificationUrl: 'http://localhost:5173/verificar/K7M2-P9QX-4TZA',
};

describe('MockCertificateValidator', () => {
  it('registers idempotently by certificate code', async () => {
    const validator = new MockCertificateValidator();
    const first = await validator.register(certificate);
    const second = await validator.register(certificate);
    expect(second.externalId).toBe(first.externalId);
  });

  it('revokes a registered certificate with a reason', async () => {
    const validator = new MockCertificateValidator();
    await validator.register(certificate);
    await validator.revoke({
      code: certificate.code,
      reason: 'Reemisión por corrección de nombre',
    });
    expect(validator.lookup(certificate.code)?.revokedReason).toMatch(/Reemisión/);
  });

  it('fails to revoke an unknown certificate', async () => {
    const validator = new MockCertificateValidator();
    await expect(validator.revoke({ code: 'NOPE', reason: 'x' })).rejects.toBeInstanceOf(
      IntegrationError,
    );
  });
});
