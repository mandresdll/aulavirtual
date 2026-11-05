import {
  SALES_DOCUMENT_STATUS_LABELS,
  SALES_DOCUMENT_TYPE_LABELS,
  toLocalIsoDate,
  type SalesDocumentStatus,
  type SalesDocumentType,
} from '@plataforma/shared';
import type { DOCUMENT_COLUMN_KEYS } from '../../config/env.js';
import type { Cell, Table } from '../../lib/tabular.js';

export type DocumentColumn = (typeof DOCUMENT_COLUMN_KEYS)[number];

export interface DocumentLine {
  courseTitle: string;
  totalClp: number;
  taxTreatment: 'taxed' | 'exempt';
}

export interface DocumentRecord {
  folio: string | null;
  type: SalesDocumentType;
  status: SalesDocumentStatus;
  paidAt: Date | null;
  orderNumber: string;
  receiverRut: string | null;
  receiverName: string;
  receiverActivity: string | null;
  receiverAddress: string | null;
  receiverEmail: string;
  lines: DocumentLine[];
  refundedClp: number;
}

/** Separa neto, IVA y exento. Los precios afectos ya incluyen IVA (supuesto de Q6). */
export function splitTax(lines: readonly DocumentLine[], vatPercent: number) {
  const taxed = lines
    .filter((line) => line.taxTreatment === 'taxed')
    .reduce((sum, line) => sum + line.totalClp, 0);
  const exempt = lines
    .filter((line) => line.taxTreatment === 'exempt')
    .reduce((sum, line) => sum + line.totalClp, 0);
  const net = Math.round(taxed / (1 + vatPercent / 100));
  return { net, vat: taxed - net, exempt, total: taxed + exempt };
}

const COLUMNS: Record<
  DocumentColumn,
  { header: string; value: (record: DocumentRecord, vatPercent: number) => Cell }
> = {
  folio: { header: 'Folio', value: (record) => record.folio },
  tipo: { header: 'Tipo', value: (record) => SALES_DOCUMENT_TYPE_LABELS[record.type] },
  fecha: {
    header: 'Fecha de pago',
    value: (record) => (record.paidAt ? toLocalIsoDate(record.paidAt) : null),
  },
  orden: { header: 'Orden', value: (record) => record.orderNumber },
  rut: { header: 'RUT receptor', value: (record) => record.receiverRut },
  razon_social: { header: 'Receptor', value: (record) => record.receiverName },
  giro: { header: 'Giro', value: (record) => record.receiverActivity },
  direccion: { header: 'Dirección', value: (record) => record.receiverAddress },
  correo: { header: 'Correo', value: (record) => record.receiverEmail },
  detalle: {
    header: 'Detalle',
    value: (record) => record.lines.map((line) => line.courseTitle).join(', '),
  },
  neto: { header: 'Neto', value: (record, vat) => splitTax(record.lines, vat).net },
  iva: { header: 'IVA', value: (record, vat) => splitTax(record.lines, vat).vat },
  exento: { header: 'Exento', value: (record, vat) => splitTax(record.lines, vat).exempt },
  total: { header: 'Total', value: (record, vat) => splitTax(record.lines, vat).total },
  devuelto: { header: 'Devuelto', value: (record) => record.refundedClp },
  estado: { header: 'Estado', value: (record) => SALES_DOCUMENT_STATUS_LABELS[record.status] },
};

/** Archivo contable con las columnas configuradas (`INVOICING_EXPORT_COLUMNS`, Q6). */
export function documentsTable(
  records: readonly DocumentRecord[],
  columns: readonly DocumentColumn[],
  vatPercent: number,
): Table {
  return {
    name: 'documentos',
    headers: columns.map((column) => COLUMNS[column].header),
    rows: records.map((record) =>
      columns.map((column) => COLUMNS[column].value(record, vatPercent)),
    ),
  };
}
