import { z } from 'zod';
import { IdSchema, PaginationQuerySchema, paginated } from './admin.js';
import { OrderStatusSchema, SalesDocumentTypeSchema, type SalesDocumentType } from './commerce.js';

/** Ventas, documentos, conciliación y reportes (RF-08, RF-09). */

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const LocalDateSchema = z.iso.date('Fecha inválida (AAAA-MM-DD)');
const optionalDate = z.preprocess(blankToUndefined, LocalDateSchema.optional());
const optionalId = z.preprocess(blankToUndefined, IdSchema.optional());

const orderedPeriod = (input: { from: string; to: string }) => input.from <= input.to;
const PERIOD_ERROR = {
  path: ['to'],
  message: 'La fecha final debe ser igual o posterior a la inicial',
};

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export const ExportFormatSchema = z.enum(EXPORT_FORMATS);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

// --- Ventas --------------------------------------------------------------------------------

const salesFilters = {
  /** Días calendario en hora de Punta Arenas, sobre la fecha de creación de la orden. */
  from: optionalDate,
  to: optionalDate,
  status: z.preprocess(blankToUndefined, OrderStatusSchema.optional()),
  /** Número de orden, correo o nombre del comprador. */
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  courseId: optionalId,
};

export const SalesQuerySchema = PaginationQuerySchema.extend(salesFilters);
export type SalesQuery = z.infer<typeof SalesQuerySchema>;

export const SalesExportQuerySchema = z.object({
  ...salesFilters,
  format: ExportFormatSchema.default('xlsx'),
});
export type SalesExportQuery = z.infer<typeof SalesExportQuerySchema>;

export const SALES_DOCUMENT_STATUSES = ['pending', 'exported', 'issued', 'failed'] as const;
export const SalesDocumentStatusSchema = z.enum(SALES_DOCUMENT_STATUSES);
export type SalesDocumentStatus = z.infer<typeof SalesDocumentStatusSchema>;

export const SALES_DOCUMENT_STATUS_LABELS: Record<SalesDocumentStatus, string> = {
  pending: 'Pendiente',
  exported: 'Exportado',
  issued: 'Emitido',
  failed: 'Con error',
};

export const SALES_DOCUMENT_TYPE_LABELS: Record<SalesDocumentType, string> = {
  receipt: 'Boleta',
  invoice: 'Factura',
};

export const SaleSchema = z.object({
  number: z.string(),
  status: OrderStatusSchema,
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  buyerName: z.string(),
  buyerEmail: z.string(),
  courses: z.array(z.string()),
  discountClp: z.number().int(),
  totalClp: z.number().int(),
  refundedClp: z.number().int(),
  documentType: SalesDocumentTypeSchema,
  documentStatus: SalesDocumentStatusSchema.nullable(),
  folio: z.string().nullable(),
  utmCampaign: z.string().nullable(),
});
export type Sale = z.infer<typeof SaleSchema>;

export const SalesResponseSchema = paginated(SaleSchema);

// --- Documentos ----------------------------------------------------------------------------

export const DocumentsQuerySchema = PaginationQuerySchema.extend({
  /** Días calendario en hora de Punta Arenas, sobre la fecha de pago. */
  from: optionalDate,
  to: optionalDate,
  status: z.preprocess(blankToUndefined, SalesDocumentStatusSchema.optional()),
});
export type DocumentsQuery = z.infer<typeof DocumentsQuerySchema>;

export const AdminDocumentSchema = z.object({
  id: IdSchema,
  orderNumber: z.string(),
  type: SalesDocumentTypeSchema,
  status: SalesDocumentStatusSchema,
  receiverName: z.string(),
  totalClp: z.number().int(),
  refundedClp: z.number().int(),
  paidAt: z.string().nullable(),
  folio: z.string().nullable(),
  exportedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type AdminDocument = z.infer<typeof AdminDocumentSchema>;

export const DocumentsResponseSchema = paginated(AdminDocumentSchema).extend({
  /** `true` si los documentos se entregan por archivo y el folio se registra a mano. */
  deliveredByFile: z.boolean(),
});

export const DocumentExportSchema = z
  .object({ format: ExportFormatSchema, from: LocalDateSchema, to: LocalDateSchema })
  .refine(orderedPeriod, PERIOD_ERROR);
export type DocumentExport = z.infer<typeof DocumentExportSchema>;

export const RegisterFolioSchema = z.object({
  folio: z.string().trim().min(1, 'Ingresa el folio').max(50),
});
export type RegisterFolio = z.infer<typeof RegisterFolioSchema>;

// --- Conciliación --------------------------------------------------------------------------

export const DISCREPANCY_KINDS = ['status_mismatch', 'amount_mismatch'] as const;
export const DiscrepancyKindSchema = z.enum(DISCREPANCY_KINDS);
export type DiscrepancyKind = z.infer<typeof DiscrepancyKindSchema>;

export const DISCREPANCY_KIND_LABELS: Record<DiscrepancyKind, string> = {
  status_mismatch: 'Estado distinto',
  amount_mismatch: 'Monto distinto',
};

export const DiscrepancySchema = z.object({
  id: IdSchema,
  orderNumber: z.string(),
  buyOrder: z.string(),
  kind: DiscrepancyKindSchema,
  localStatus: z.string(),
  gatewayStatus: z.string(),
  localAmountClp: z.number().int(),
  gatewayAmountClp: z.number().int(),
  day: z.string(),
});
export type Discrepancy = z.infer<typeof DiscrepancySchema>;

export const ReconciliationRunSchema = z.object({
  day: z.string(),
  checked: z.number().int().nonnegative(),
  discrepancies: z.number().int().nonnegative(),
  /** Transacciones que no se pudieron consultar en la pasarela. */
  failed: z.number().int().nonnegative(),
  finishedAt: z.string(),
});
export type ReconciliationRun = z.infer<typeof ReconciliationRunSchema>;

/** Última conciliación y diferencias sin resolver. */
export const ReconciliationResponseSchema = z.object({
  lastRun: ReconciliationRunSchema.nullable(),
  items: z.array(DiscrepancySchema),
});

export const RunReconciliationSchema = z.object({ day: LocalDateSchema });
export type RunReconciliation = z.infer<typeof RunReconciliationSchema>;

export const ResolveDiscrepancySchema = z.object({
  note: z.string().trim().min(3, 'Explica cómo se resolvió').max(500),
});
export type ResolveDiscrepancy = z.infer<typeof ResolveDiscrepancySchema>;

// --- Reportes ------------------------------------------------------------------------------

export const REPORT_GROUPS = ['course', 'edition', 'month'] as const;
export const ReportGroupSchema = z.enum(REPORT_GROUPS);
export type ReportGroup = z.infer<typeof ReportGroupSchema>;

export const REPORT_GROUP_LABELS: Record<ReportGroup, string> = {
  course: 'Curso',
  edition: 'Edición',
  month: 'Mes',
};

const reportFilters = {
  from: LocalDateSchema,
  to: LocalDateSchema,
  courseId: optionalId,
  editionId: optionalId,
  groupBy: ReportGroupSchema.default('course'),
};

export const ReportQuerySchema = z.object(reportFilters).refine(orderedPeriod, PERIOD_ERROR);
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

export const REPORT_TABLES = ['summary', 'conversion'] as const;
export const ReportExportQuerySchema = z
  .object({
    ...reportFilters,
    table: z.enum(REPORT_TABLES).default('summary'),
    format: ExportFormatSchema.default('xlsx'),
  })
  .refine(orderedPeriod, PERIOD_ERROR);
export type ReportExportQuery = z.infer<typeof ReportExportQuerySchema>;

const count = z.number().int().nonnegative();

export const ReportMetricsSchema = z.object({
  orders: count,
  grossClp: count,
  discountClp: count,
  refundsClp: count,
  /** Brutos menos descuentos y devoluciones. */
  netClp: z.number().int(),
  paidEnrollments: count,
  freeEnrollments: count,
  completed: count,
  failedCourse: count,
  certificates: count,
});
export type ReportMetrics = z.infer<typeof ReportMetricsSchema>;

export const ReportRowSchema = ReportMetricsSchema.extend({
  key: z.string(),
  label: z.string(),
});
export type ReportRow = z.infer<typeof ReportRowSchema>;

export const ConversionRowSchema = z.object({
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  views: count,
  leads: count,
  orders: count,
  paid: count,
});
export type ConversionRow = z.infer<typeof ConversionRowSchema>;

export const ReportSchema = z.object({
  totals: ReportMetricsSchema,
  rows: z.array(ReportRowSchema),
  conversion: z.array(ConversionRowSchema),
});
export type Report = z.infer<typeof ReportSchema>;
