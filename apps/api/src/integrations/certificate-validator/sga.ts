import { IntegrationError } from '../errors.js';
import type { CertificateRegistration, CertificateValidator } from './port.js';

export interface SgaValidatorConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  /** Inyectable para pruebas. */
  fetch?: typeof fetch;
}

/**
 * Cliente del validador de certificados del SGA sobre un contrato supuesto (Q5, por confirmar):
 * - `POST {url}/certificates` con el certificado; devuelve `{ externalId }`. 409 = ya publicado.
 * - `POST {url}/certificates/{code}/revoke` con `{ reason }`.
 * Autenticación con `Authorization: Bearer {token}`. Ver docs/integraciones.md.
 */
export class SgaCertificateValidator implements CertificateValidator {
  readonly provider = 'sga';

  constructor(readonly config: SgaValidatorConfig) {}

  async register(certificate: CertificateRegistration): Promise<{ externalId: string }> {
    const response = await this.post('certificates', {
      ...certificate,
      issuedAt: certificate.issuedAt.toISOString(),
    });
    if (response.status === 409) return { externalId: certificate.code };
    const body = (await response.json().catch(() => null)) as { externalId?: unknown } | null;
    return {
      externalId: typeof body?.externalId === 'string' ? body.externalId : certificate.code,
    };
  }

  async revoke({ code, reason }: { code: string; reason: string }): Promise<void> {
    await this.post(`certificates/${encodeURIComponent(code)}/revoke`, { reason });
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const base = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;
    const doFetch = this.config.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(new URL(path, base), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new IntegrationError(
        'certificate-validator',
        'UNAVAILABLE',
        'Certificate validator unreachable',
        true,
        { cause: error },
      );
    }
    if (!response.ok && response.status !== 409) {
      throw new IntegrationError(
        'certificate-validator',
        `HTTP_${response.status}`,
        `Certificate validator responded ${response.status}`,
        response.status >= 500,
      );
    }
    return response;
  }
}
