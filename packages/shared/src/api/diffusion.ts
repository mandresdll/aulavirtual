import { z } from 'zod';
import { IdSchema, PaginationQuerySchema, paginated } from './admin.js';
import { UtmSchema } from './commerce.js';

/** Difusión: interesados, novedades y campañas con UTM (RF-02). */

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * Texto de consentimiento vigente. Si cambia, cambia la versión: cada interesado guarda el texto
 * y la versión que aceptó. Es un borrador hasta que el CFT confirme la redacción oficial.
 */
export const LEAD_CONSENT = {
  version: '2026.1-borrador',
  text:
    'Acepto que el CFT Estatal de Magallanes use mi nombre y correo para enviarme novedades ' +
    'sobre los cursos de la UTA. Puedo darme de baja en cualquier momento.',
} as const;

export const LeadRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Ingresa un correo válido')),
  name: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  courseSlug: z.string().max(200).optional(),
  consent: z.literal(true, { error: 'Debes aceptar para recibir novedades' }),
  consentVersion: z.string().max(20),
  utm: UtmSchema.optional(),
});
export type LeadRequest = z.infer<typeof LeadRequestSchema>;

export const PageViewSchema = z.object({ utm: UtmSchema.optional() });
export type PageView = z.infer<typeof PageViewSchema>;

export const UnsubscribeParamsSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Enlace de baja inválido'),
});

export const LEAD_STATUSES = ['active', 'unsubscribed'] as const;
export const LeadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  active: 'Activo',
  unsubscribed: 'De baja',
};

export const AdminLeadsQuerySchema = PaginationQuerySchema.extend({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  status: z.preprocess(blankToUndefined, LeadStatusSchema.optional()),
});
export type AdminLeadsQuery = z.infer<typeof AdminLeadsQuerySchema>;

export const AdminLeadSchema = z.object({
  id: IdSchema,
  email: z.string(),
  name: z.string().nullable(),
  courseTitle: z.string().nullable(),
  status: LeadStatusSchema,
  consentVersion: z.string(),
  consentedAt: z.string(),
  utmCampaign: z.string().nullable(),
});
export type AdminLead = z.infer<typeof AdminLeadSchema>;

export const AdminLeadsResponseSchema = paginated(AdminLeadSchema);

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export const CampaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  sending: 'Enviando',
  sent: 'Enviada',
  cancelled: 'Cancelada',
};

export const CampaignInputSchema = z.object({
  subject: z.string().trim().min(3, 'Escribe un asunto').max(200),
  body: z.string().trim().min(10, 'Escribe el mensaje').max(10_000),
});
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export const AdminCampaignSchema = z.object({
  id: IdSchema,
  subject: z.string(),
  body: z.string(),
  status: CampaignStatusSchema,
  createdAt: z.string(),
  sentAt: z.string().nullable(),
  recipients: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type AdminCampaign = z.infer<typeof AdminCampaignSchema>;

export const AdminCampaignsResponseSchema = z.object({
  items: z.array(AdminCampaignSchema),
  /** Correos distintos que hoy recibirían una campaña. */
  audience: z.number().int().nonnegative(),
});

export const UTM_PARAMS = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
} as const;

export type Utm = z.infer<typeof UtmSchema>;

/** Lee los parámetros UTM de una URL; `null` si no trae ninguno válido. */
export function parseUtm(search: string): Utm | null {
  const params = new URLSearchParams(search);
  const raw = Object.fromEntries(
    Object.entries(UTM_PARAMS).flatMap(([key, param]) => {
      const value = params.get(param)?.trim();
      return value ? [[key, value]] : [];
    }),
  );
  const parsed = UtmSchema.safeParse(raw);
  return parsed.success && Object.keys(parsed.data).length > 0 ? parsed.data : null;
}

/** Agrega los parámetros UTM a un enlace del sitio (generador del panel). */
export function buildUtmLink(url: string, utm: Utm): string {
  const link = new URL(url);
  for (const [key, param] of Object.entries(UTM_PARAMS)) {
    const value = utm[key as keyof Utm]?.trim();
    if (value) link.searchParams.set(param, value);
  }
  return link.toString();
}
