import { z } from 'zod';
import { EnrollmentStatusSchema } from './enrollment.js';

/** Certificados y «Mis cursos» (RF-06). Fechas en ISO 8601 UTC. */

/** Respuesta pública: solo lo necesario para comprobar el certificado. */
export const VerificationSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('valid'),
    code: z.string(),
    holderName: z.string(),
    courseTitle: z.string(),
    hours: z.number().int().positive(),
    issuedAt: z.iso.datetime(),
  }),
  z.object({ status: z.literal('revoked'), code: z.string(), revokedAt: z.iso.datetime() }),
  /** Reemplazado por una reemisión: `replacedBy` es el código vigente. */
  z.object({ status: z.literal('reissued'), code: z.string(), replacedBy: z.string().nullable() }),
  z.object({ status: z.literal('not_found') }),
]);
export type Verification = z.infer<typeof VerificationSchema>;

export const VerifyParamsSchema = z.object({ code: z.string().min(1).max(40) });

export const MyCoursesSchema = z.object({
  items: z.array(
    z.object({
      editionId: z.string(),
      courseTitle: z.string(),
      courseSlug: z.string(),
      editionCode: z.string(),
      status: EnrollmentStatusSchema,
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      /** Código del certificado vigente, si existe. */
      certificateCode: z.string().nullable(),
    }),
  ),
  /** Enlace al Aula Virtual, si está configurado. */
  lmsUrl: z.string().nullable(),
});
export type MyCourses = z.infer<typeof MyCoursesSchema>;

export const CERTIFICATE_STATUSES = ['valid', 'revoked', 'reissued'] as const;
export const CertificateStatusSchema = z.enum(CERTIFICATE_STATUSES);
export type CertificateStatus = z.infer<typeof CertificateStatusSchema>;

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  valid: 'Válido',
  revoked: 'Revocado',
  reissued: 'Reemplazado',
};

export const SYNC_STATUS_LABELS: Record<'pending' | 'synced' | 'failed', string> = {
  pending: 'Pendiente',
  synced: 'Sincronizado',
  failed: 'Con error',
};

export const AdminCertificateSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: CertificateStatusSchema,
  recipientName: z.string(),
  email: z.string(),
  courseTitle: z.string(),
  editionCode: z.string(),
  issuedAt: z.iso.datetime(),
  revocationReason: z.string().nullable(),
  validatorSyncStatus: z.enum(['pending', 'synced', 'failed']),
  validatorLastError: z.string().nullable(),
});
export type AdminCertificate = z.infer<typeof AdminCertificateSchema>;

export const AdminCertificatesQuerySchema = z.object({
  /** Código, correo o nombre. */
  q: z.string().trim().min(3, 'Escribe al menos 3 caracteres').max(100),
});

export const AdminCertificatesResponseSchema = z.object({ items: z.array(AdminCertificateSchema) });

export const ReissueCertificateSchema = z.object({
  recipientName: z.string().trim().min(3, 'Indica el nombre').max(200),
});
export type ReissueCertificate = z.infer<typeof ReissueCertificateSchema>;

export const RevokeCertificateSchema = z.object({
  reason: z.string().trim().min(5, 'Indica el motivo (mínimo 5 caracteres)').max(500),
});
export type RevokeCertificate = z.infer<typeof RevokeCertificateSchema>;

/** Decisión manual de un curso sin nota. */
export const ManualResultSchema = z.object({ result: z.enum(['completed', 'failed_course']) });

export const SyncResultsResponseSchema = z.object({
  checked: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type SyncResults = z.infer<typeof SyncResultsResponseSchema>;
