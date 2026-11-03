import { AdapterNotImplementedError } from '../errors.js';
import type { CertificateRegistration, CertificateValidator } from './port.js';

export interface SgaValidatorConfig {
  baseUrl: string;
  token: string;
}

/** Cliente del validador de certificados del SGA. Contrato pendiente (Q5); Fase 6. */
export class SgaCertificateValidator implements CertificateValidator {
  readonly provider = 'sga';

  constructor(readonly config: SgaValidatorConfig) {}

  async register(_certificate: CertificateRegistration): Promise<{ externalId: string }> {
    throw this.notYet();
  }

  async revoke(_input: { code: string; reason: string }): Promise<void> {
    throw this.notYet();
  }

  private notYet() {
    return new AdapterNotImplementedError(
      'certificate-validator',
      'contrato del validador del SGA pendiente (Q5)',
    );
  }
}
