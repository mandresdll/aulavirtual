import { z } from 'zod';

/** Derechos del titular de datos: acceso y supresión (Leyes 19.628 y 21.719). */

/** El correo viaja en el cuerpo, nunca en la URL: las URL quedan en registros intermedios. */
export const DataSubjectRequestSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Ingresa un correo válido')),
});
export type DataSubjectRequest = z.infer<typeof DataSubjectRequestSchema>;

const count = z.number().int().nonnegative();

export const DataSubjectSummarySchema = z.object({
  /** `null` si el correo solo figura como interesado, sin cuenta. */
  name: z.string().nullable(),
  orders: count,
  enrollments: count,
  certificates: count,
  leads: count,
  /** Motivo por el que aún no se puede anonimizar, o `null`. */
  blockedReason: z.string().nullable(),
});
export type DataSubjectSummary = z.infer<typeof DataSubjectSummarySchema>;
