import { z } from 'zod';

/** Inscripciones y lista de espera (RF-04, RF-05). Fechas en ISO 8601 UTC. */

export const ENROLLMENT_STATUSES = [
  'pending_lms',
  'enrolled',
  'failed',
  'completed',
  'failed_course',
  'withdrawn',
] as const;
export const EnrollmentStatusSchema = z.enum(ENROLLMENT_STATUSES);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusSchema>;

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending_lms: 'Matrícula pendiente',
  enrolled: 'Matriculado',
  failed: 'Matrícula fallida',
  completed: 'Aprobado',
  failed_course: 'Reprobado',
  withdrawn: 'Retirado',
};

export const ENROLLMENT_SOURCES = [
  'purchase',
  'free_institutional',
  'coupon_100',
  'manual_admin',
] as const;
export const EnrollmentSourceSchema = z.enum(ENROLLMENT_SOURCES);

export const ENROLLMENT_SOURCE_LABELS: Record<z.infer<typeof EnrollmentSourceSchema>, string> = {
  purchase: 'Compra',
  free_institutional: 'Liberada comunidad CFT',
  coupon_100: 'Cupón 100 %',
  manual_admin: 'Manual',
};

export const EditionRequestSchema = z.object({ editionId: z.uuid() });

/** Lo que el usuario tiene en cada edición: la ficha decide qué botón mostrar. */
export const MyEnrollmentsSchema = z.object({
  enrolledEditionIds: z.array(z.string()),
  waitlist: z.array(
    z.object({
      editionId: z.string(),
      /** Lugar en la fila; `null` si ya tiene una oferta. */
      position: z.number().int().positive().nullable(),
      /** Si tiene un cupo retenido, hasta cuándo puede comprarlo. */
      offerExpiresAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type MyEnrollments = z.infer<typeof MyEnrollmentsSchema>;

export const AdminEnrollmentsQuerySchema = z.object({
  status: z.enum(['failed', 'pending_lms']).default('failed'),
});

export const AdminEnrollmentSchema = z.object({
  id: z.string(),
  status: EnrollmentStatusSchema,
  source: EnrollmentSourceSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  user: z.object({ name: z.string(), email: z.string() }),
  courseTitle: z.string(),
  editionCode: z.string(),
  createdAt: z.iso.datetime(),
});
export type AdminEnrollment = z.infer<typeof AdminEnrollmentSchema>;

export const AdminEnrollmentsResponseSchema = z.object({ items: z.array(AdminEnrollmentSchema) });

export const AdminWaitlistEntrySchema = z.object({
  id: z.string(),
  courseTitle: z.string(),
  editionCode: z.string(),
  position: z.number().int().positive(),
  status: z.enum(['waiting', 'notified']),
  user: z.object({ name: z.string(), email: z.string() }),
  offerExpiresAt: z.iso.datetime().nullable(),
});
export type AdminWaitlistEntry = z.infer<typeof AdminWaitlistEntrySchema>;

export const AdminWaitlistResponseSchema = z.object({ items: z.array(AdminWaitlistEntrySchema) });
