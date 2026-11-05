import { IntegrationError } from '../errors.js';
import type { InvoicingGateway, SalesDocumentResult } from './port.js';

/**
 * Sin integración directa (supuesto de Q6): los documentos salen en el archivo contable del panel
 * y el folio se registra a mano. El barrido del worker no lo llama (`deliversByFile`).
 */
export class ExportInvoicingGateway implements InvoicingGateway {
  readonly provider = 'export';
  readonly deliversByFile = true;

  async submit(): Promise<SalesDocumentResult> {
    return { status: 'pending' };
  }

  async getStatus(): Promise<SalesDocumentResult> {
    throw new IntegrationError('invoicing', 'NOT_SUPPORTED', 'Export driver has no remote status');
  }
}
