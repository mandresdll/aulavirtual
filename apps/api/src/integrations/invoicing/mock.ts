import { IntegrationError } from '../errors.js';
import type { InvoicingGateway, SalesDocumentInput, SalesDocumentResult } from './port.js';

/** Emisor simulado: asigna folios correlativos y valida los datos mínimos de factura. */
export class MockInvoicingGateway implements InvoicingGateway {
  readonly provider = 'mock';
  private readonly documents = new Map<string, SalesDocumentResult>();
  private nextFolio = 1;

  async submit(document: SalesDocumentInput): Promise<SalesDocumentResult> {
    const externalId = `DOC-${document.orderId}`;
    const existing = this.documents.get(externalId);
    if (existing) return existing;

    const { receiver } = document;
    if (
      document.type === 'factura' &&
      (!receiver.rut || !receiver.businessActivity || !receiver.address)
    ) {
      throw new IntegrationError(
        'invoicing',
        'MISSING_INVOICE_DATA',
        'Invoice requires RUT, business activity and address',
      );
    }
    const linesTotal = document.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitAmount,
      0,
    );
    if (linesTotal !== document.totalAmount) {
      throw new IntegrationError('invoicing', 'TOTAL_MISMATCH', 'Lines do not add up to total');
    }

    const result: SalesDocumentResult = {
      status: 'issued',
      externalId,
      folio: String(this.nextFolio++),
    };
    this.documents.set(externalId, result);
    return result;
  }

  async getStatus(externalId: string): Promise<SalesDocumentResult> {
    const result = this.documents.get(externalId);
    if (!result) throw new IntegrationError('invoicing', 'NOT_FOUND', 'Unknown document');
    return result;
  }
}
