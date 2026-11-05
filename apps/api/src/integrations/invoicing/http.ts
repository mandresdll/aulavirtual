import { IntegrationError } from '../errors.js';
import type {
  InvoicingGateway,
  SalesDocumentInput,
  SalesDocumentResult,
  SalesDocumentStatus,
} from './port.js';

export interface HttpInvoicingConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  /** Inyectable para pruebas. */
  fetch?: typeof fetch;
}

const STATUSES: readonly SalesDocumentStatus[] = ['pending', 'issued', 'exported', 'rejected'];

/**
 * Cliente del sistema de boletas/facturas sobre un contrato supuesto (Q6, por confirmar):
 * - `POST {url}/documents` con el documento y `Idempotency-Key`; 409 = ya recibido.
 * - `GET {url}/documents/{externalId}`.
 * Ambos responden `{ externalId, status, folio? }`. Autenticación `Authorization: Bearer {token}`.
 * Ver docs/integraciones.md.
 */
export class HttpInvoicingGateway implements InvoicingGateway {
  readonly provider = 'http';
  readonly deliversByFile = false;

  constructor(readonly config: HttpInvoicingConfig) {}

  async submit(document: SalesDocumentInput): Promise<SalesDocumentResult> {
    const response = await this.request('documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': document.orderId },
      body: JSON.stringify({ ...document, issuedAt: document.issuedAt.toISOString() }),
    });
    return this.parse(response);
  }

  async getStatus(externalId: string): Promise<SalesDocumentResult> {
    const response = await this.request(`documents/${encodeURIComponent(externalId)}`, {
      method: 'GET',
    });
    return this.parse(response);
  }

  private async parse(response: Response): Promise<SalesDocumentResult> {
    const body = (await response.json().catch(() => null)) as {
      externalId?: unknown;
      status?: unknown;
      folio?: unknown;
    } | null;
    const status = STATUSES.find((item) => item === body?.status);
    if (!status || typeof body?.externalId !== 'string') {
      throw new IntegrationError(
        'invoicing',
        'BAD_RESPONSE',
        'Unexpected invoicing response',
        true,
      );
    }
    return {
      status,
      externalId: body.externalId,
      ...(typeof body.folio === 'string' ? { folio: body.folio } : {}),
    };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const base = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`;
    const doFetch = this.config.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(new URL(path, base), {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.config.token}` },
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new IntegrationError('invoicing', 'UNAVAILABLE', 'Invoicing unreachable', true, {
        cause: error,
      });
    }
    if (!response.ok && response.status !== 409) {
      throw new IntegrationError(
        'invoicing',
        `HTTP_${response.status}`,
        `Invoicing responded ${response.status}`,
        response.status >= 500,
      );
    }
    return response;
  }
}
