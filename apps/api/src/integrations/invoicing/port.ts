import type { ClpAmount } from '@plataforma/shared';

/**
 * Puerto del sistema de emisión de boletas/facturas electrónicas del CFT (RF-08).
 * Supuesto por defecto (Q6): exportación CSV/XLSX configurable; si el sistema tiene API,
 * se usa el adaptador HTTP. El tratamiento tributario se configura por edición.
 */
export type SalesDocumentType = 'boleta' | 'factura';
export type TaxTreatment = 'affected' | 'exempt';

export interface SalesDocumentReceiver {
  name: string;
  email?: string;
  /** Obligatorios para factura. */
  rut?: string;
  businessActivity?: string;
  address?: string;
}

export interface SalesDocumentLine {
  description: string;
  quantity: number;
  unitAmount: ClpAmount;
  taxTreatment: TaxTreatment;
}

export interface SalesDocumentInput {
  orderId: string;
  type: SalesDocumentType;
  issuedAt: Date;
  totalAmount: ClpAmount;
  receiver: SalesDocumentReceiver;
  lines: SalesDocumentLine[];
}

export type SalesDocumentStatus = 'pending' | 'issued' | 'exported' | 'rejected';

export interface SalesDocumentResult {
  status: SalesDocumentStatus;
  externalId?: string;
  /** Folio asignado por el sistema de emisión, cuando lo informa. */
  folio?: string;
}

export interface InvoicingGateway {
  readonly provider: string;
  /** `true` si los documentos salen en el archivo contable y el folio se registra a mano. */
  readonly deliversByFile: boolean;
  submit(document: SalesDocumentInput): Promise<SalesDocumentResult>;
  getStatus(externalId: string): Promise<SalesDocumentResult>;
}
