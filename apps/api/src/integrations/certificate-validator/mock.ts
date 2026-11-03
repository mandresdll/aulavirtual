import { IntegrationError } from '../errors.js';
import type { CertificateRegistration, CertificateValidator } from './port.js';

interface StoredCertificate {
  externalId: string;
  certificate: CertificateRegistration;
  revokedReason: string | null;
}

export class MockCertificateValidator implements CertificateValidator {
  readonly provider = 'mock';
  private readonly certificates = new Map<string, StoredCertificate>();

  async register(certificate: CertificateRegistration): Promise<{ externalId: string }> {
    const existing = this.certificates.get(certificate.code);
    if (existing) return { externalId: existing.externalId };
    const externalId = `VAL-${this.certificates.size + 1}`;
    this.certificates.set(certificate.code, { externalId, certificate, revokedReason: null });
    return { externalId };
  }

  async revoke({ code, reason }: { code: string; reason: string }): Promise<void> {
    const stored = this.certificates.get(code);
    if (!stored) {
      throw new IntegrationError('certificate-validator', 'NOT_FOUND', 'Unknown certificate');
    }
    stored.revokedReason = reason;
  }

  /** Estado registrado, para verificar en pruebas. */
  lookup(code: string): StoredCertificate | undefined {
    return this.certificates.get(code);
  }
}
