import { AdapterNotImplementedError } from '../errors.js';
import type { InvoicingGateway, SalesDocumentInput, SalesDocumentResult } from './port.js';

/**
 * Adaptadores reales pendientes (Q6), Fase 7:
 * - `export`: genera el archivo CSV/XLSX con el formato contable acordado.
 * - `http`: integración directa con la API del sistema de emisión, si existe.
 */
export class PendingInvoicingGateway implements InvoicingGateway {
  constructor(readonly provider: 'export' | 'http') {}

  async submit(_document: SalesDocumentInput): Promise<SalesDocumentResult> {
    throw this.notYet();
  }

  async getStatus(_externalId: string): Promise<SalesDocumentResult> {
    throw this.notYet();
  }

  private notYet() {
    return new AdapterNotImplementedError(
      'invoicing',
      `adaptador "${this.provider}" pendiente de formato/contrato (Q6)`,
    );
  }
}
