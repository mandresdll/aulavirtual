import { z } from 'zod';
import { TaxTreatmentSchema } from '../domain/catalog.js';
import { ClpAmountSchema } from '../domain/money.js';
import { RutSchema } from '../domain/rut.js';

/**
 * Esquemas de carrito, cupones, textos legales y checkout (RF-03, RF-04, RF-11).
 * Montos en CLP enteros; fechas en ISO 8601 UTC.
 */

const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const requiredText = (max: number) =>
  z.string().trim().min(1, 'Este campo es obligatorio').max(max, `Máximo ${max} caracteres`);

// --- Textos legales (RF-11) ------------------------------------------------------------------

export const LEGAL_DOCUMENT_TYPES = ['terms', 'privacy', 'withdrawal', 'refunds'] as const;
export const LegalDocumentTypeSchema = z.enum(LEGAL_DOCUMENT_TYPES);
export type LegalDocumentType = z.infer<typeof LegalDocumentTypeSchema>;

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  terms: 'Términos y condiciones',
  privacy: 'Política de privacidad',
  withdrawal: 'Derecho de retracto',
  refunds: 'Política de devoluciones',
};

/** Rutas públicas de cada texto: `/legal/{slug}`. */
export const LEGAL_DOCUMENT_SLUGS: Record<LegalDocumentType, string> = {
  terms: 'terminos',
  privacy: 'privacidad',
  withdrawal: 'retracto',
  refunds: 'devoluciones',
};

export const LegalDocumentSchema = z.object({
  type: LegalDocumentTypeSchema,
  version: z.string(),
  title: z.string(),
  /** Markdown sin HTML: la SPA lo muestra sin interpretar HTML (sanitización). */
  content: z.string(),
  contentSha256: z.string(),
  effectiveFrom: z.iso.datetime(),
});
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

export const CurrentLegalDocumentsSchema = z.object({ items: z.array(LegalDocumentSchema) });

export const ProviderInfoSchema = z.object({
  name: z.string(),
  rut: z.string(),
  address: z.string(),
  email: z.string(),
  phone: z.string(),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const LegalVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[0-9A-Za-z.-]+$/, 'Usa números, letras, puntos o guiones (p. ej. 2026.1)');

export const LegalDocumentInputSchema = z.object({
  type: LegalDocumentTypeSchema,
  version: LegalVersionSchema,
  title: requiredText(200),
  content: requiredText(100_000),
  /** Desde cuándo rige. Puede ser futura (se publica sola en esa fecha). */
  effectiveFrom: z.iso.datetime(),
});
export type LegalDocumentInput = z.infer<typeof LegalDocumentInputSchema>;

export const AdminLegalDocumentSchema = LegalDocumentSchema.extend({
  id: z.string(),
  /** Versión que rige hoy para su tipo. */
  current: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminLegalDocument = z.infer<typeof AdminLegalDocumentSchema>;

export const AdminLegalDocumentsResponseSchema = z.object({
  items: z.array(AdminLegalDocumentSchema),
});

// --- Cupones (RF-04) -------------------------------------------------------------------------

export const COUPON_TYPES = ['percentage', 'fixed_amount'] as const;
export const CouponTypeSchema = z.enum(COUPON_TYPES);
export type CouponType = z.infer<typeof CouponTypeSchema>;

export const COUPON_SCOPES = ['all', 'course', 'edition'] as const;
export const CouponScopeSchema = z.enum(COUPON_SCOPES);
export type CouponScope = z.infer<typeof CouponScopeSchema>;

export const COUPON_REASONS = [
  'scholarship',
  'agreement',
  'presale',
  'promotion',
  'other',
] as const;
export const CouponReasonSchema = z.enum(COUPON_REASONS);
export type CouponReason = z.infer<typeof CouponReasonSchema>;

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  percentage: 'Porcentaje',
  fixed_amount: 'Monto fijo (CLP)',
};
export const COUPON_SCOPE_LABELS: Record<CouponScope, string> = {
  all: 'Todos los cursos',
  course: 'Un curso',
  edition: 'Una edición',
};
export const COUPON_REASON_LABELS: Record<CouponReason, string> = {
  scholarship: 'Beca',
  agreement: 'Convenio',
  presale: 'Preventa',
  promotion: 'Promoción',
  other: 'Otro',
};

/** Código de cupón: se guarda y compara en mayúsculas. */
export const CouponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(40, 'Máximo 40 caracteres')
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'Usa letras, números y guiones (p. ej. BECA-2026)');

const optionalDateTime = z.preprocess(blankToNull, z.iso.datetime().nullable()).default(null);
const optionalPositiveInt = z
  .preprocess(
    (value) => (value === '' || (typeof value === 'number' && Number.isNaN(value)) ? null : value),
    z.number().int().positive('Debe ser mayor que 0').nullable(),
  )
  .default(null);

export const CouponInputSchema = z
  .object({
    code: CouponCodeSchema,
    type: CouponTypeSchema,
    /** Porcentaje (1–100) o monto en CLP. */
    value: z.number().int('Debe ser un número entero').positive('Debe ser mayor que 0'),
    scope: CouponScopeSchema.default('all'),
    courseId: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
    editionId: z.preprocess(blankToNull, z.uuid().nullable()).default(null),
    validFrom: optionalDateTime,
    validUntil: optionalDateTime,
    maxUses: optionalPositiveInt,
    maxUsesPerUser: optionalPositiveInt,
    reason: CouponReasonSchema.default('promotion'),
    active: z.boolean().default(true),
  })
  .superRefine((coupon, ctx) => {
    if (coupon.type === 'percentage' && coupon.value > 100) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'El porcentaje máximo es 100' });
    }
    if (coupon.scope === 'course' && !coupon.courseId) {
      ctx.addIssue({ code: 'custom', path: ['courseId'], message: 'Selecciona el curso' });
    }
    if (coupon.scope === 'edition' && !coupon.editionId) {
      ctx.addIssue({ code: 'custom', path: ['editionId'], message: 'Selecciona la edición' });
    }
    if (
      coupon.validFrom &&
      coupon.validUntil &&
      Date.parse(coupon.validUntil) <= Date.parse(coupon.validFrom)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'El término de la vigencia debe ser posterior al inicio',
      });
    }
  });
export type CouponInput = z.infer<typeof CouponInputSchema>;

export const AdminCouponSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: CouponTypeSchema,
  value: z.number().int(),
  scope: CouponScopeSchema,
  courseId: z.string().nullable(),
  editionId: z.string().nullable(),
  /** Curso o edición del alcance, legible. */
  scopeLabel: z.string().nullable(),
  validFrom: z.iso.datetime().nullable(),
  validUntil: z.iso.datetime().nullable(),
  maxUses: z.number().int().nullable(),
  maxUsesPerUser: z.number().int().nullable(),
  usesCount: z.number().int().nonnegative(),
  reason: CouponReasonSchema,
  active: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type AdminCoupon = z.infer<typeof AdminCouponSchema>;

export const AdminCouponsResponseSchema = z.object({ items: z.array(AdminCouponSchema) });

// --- Carrito (RF-03) -------------------------------------------------------------------------

export const CART_MAX_ITEMS = 10;

export const CartItemSchema = z.object({
  editionId: z.string(),
  editionCode: z.string(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  startsAt: z.iso.datetime(),
  priceClp: ClpAmountSchema,
  taxTreatment: TaxTreatmentSchema,
  /** `null` si se puede comprar; si no, el motivo en español (sin cupos, cerrada…). */
  unavailableReason: z.string().nullable(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartResponseSchema = z.object({
  items: z.array(CartItemSchema),
  /** Suma de los ítems disponibles. */
  subtotalClp: ClpAmountSchema,
});
export type CartResponse = z.infer<typeof CartResponseSchema>;

export const CartEditionSchema = z.object({ editionId: z.uuid() });
export const CartMergeSchema = z.object({
  editionIds: z.array(z.uuid()).max(CART_MAX_ITEMS),
});
export const CartPreviewQuerySchema = z.object({
  /** Ids de edición separados por coma (carrito del navegador, sin sesión). */
  editionIds: z
    .string()
    .max(CART_MAX_ITEMS * 37)
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.uuid()).max(CART_MAX_ITEMS)),
});

// --- Checkout --------------------------------------------------------------------------------

export const SALES_DOCUMENT_TYPES = ['receipt', 'invoice'] as const;
export const SalesDocumentTypeSchema = z.enum(SALES_DOCUMENT_TYPES);
export type SalesDocumentType = z.infer<typeof SalesDocumentTypeSchema>;

export const SALES_DOCUMENT_LABELS: Record<SalesDocumentType, string> = {
  receipt: 'Boleta',
  invoice: 'Factura',
};

export const InvoiceDataSchema = z.object({
  rut: RutSchema,
  businessName: requiredText(200),
  activity: requiredText(200),
  address: requiredText(300),
});
export type InvoiceData = z.infer<typeof InvoiceDataSchema>;

export const QuoteRequestSchema = z.object({
  couponCode: z.preprocess(blankToNull, CouponCodeSchema.nullable()).default(null),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteLineSchema = z.object({
  editionId: z.string(),
  courseTitle: z.string(),
  editionCode: z.string(),
  unitPriceClp: ClpAmountSchema,
  discountClp: ClpAmountSchema,
  totalClp: ClpAmountSchema,
  taxTreatment: TaxTreatmentSchema,
});
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

export const QuoteSchema = z.object({
  lines: z.array(QuoteLineSchema),
  subtotalClp: ClpAmountSchema,
  discountClp: ClpAmountSchema,
  totalClp: ClpAmountSchema,
  /** Cupón aplicado, o `null`. Si se pidió uno inválido, `couponError` explica por qué. */
  coupon: z.object({ code: z.string(), description: z.string() }).nullable(),
  couponError: z.string().nullable(),
  /** Textos legales vigentes que se deben aceptar. */
  legal: z.array(LegalDocumentSchema.pick({ type: true, version: true, title: true })),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const UtmSchema = z.object({
  source: z.string().trim().max(100).optional(),
  medium: z.string().trim().max(100).optional(),
  campaign: z.string().trim().max(150).optional(),
  term: z.string().trim().max(150).optional(),
  content: z.string().trim().max(150).optional(),
});

export const IDEMPOTENCY_HEADER = 'idempotency-key';

export const CreateOrderSchema = z
  .object({
    couponCode: z.preprocess(blankToNull, CouponCodeSchema.nullable()).default(null),
    documentType: SalesDocumentTypeSchema.default('receipt'),
    invoice: InvoiceDataSchema.nullable().default(null),
    /** Versiones aceptadas: deben ser las vigentes de los cuatro textos legales. */
    acceptedLegal: z
      .array(z.object({ type: LegalDocumentTypeSchema, version: z.string().max(20) }))
      .max(LEGAL_DOCUMENT_TYPES.length),
    utm: UtmSchema.optional(),
  })
  .superRefine((order, ctx) => {
    if (order.documentType === 'invoice' && !order.invoice) {
      ctx.addIssue({
        code: 'custom',
        path: ['invoice'],
        message: 'Para factura se requieren los datos tributarios',
      });
    }
  });
export type CreateOrder = z.infer<typeof CreateOrderSchema>;

export const ORDER_STATUSES = [
  'pending',
  'awaiting_payment',
  'paid',
  'failed',
  'cancelled',
  'refund_requested',
  'refunded',
  'partially_refunded',
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  awaiting_payment: 'Esperando pago',
  paid: 'Pagada',
  failed: 'Pago rechazado',
  cancelled: 'Anulada',
  refund_requested: 'Devolución solicitada',
  refunded: 'Devuelta',
  partially_refunded: 'Devuelta parcialmente',
};

export const OrderSummarySchema = z.object({
  number: z.string(),
  status: OrderStatusSchema,
  lines: z.array(QuoteLineSchema),
  subtotalClp: ClpAmountSchema,
  discountClp: ClpAmountSchema,
  totalClp: ClpAmountSchema,
  couponCode: z.string().nullable(),
  documentType: SalesDocumentTypeSchema,
  /** Hasta cuándo se reservan los cupos para pagar (órdenes esperando pago). */
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const OrderNumberParamsSchema = z.object({
  number: z.string().regex(/^UTA-\d{4}-\d{6,}$/, 'Número de orden inválido'),
});
