import { z } from 'zod';

/** Modalidades de un curso (RF-01). */
export const MODALITIES = ['online', 'in_person', 'blended'] as const;
export const ModalitySchema = z.enum(MODALITIES);
export type Modality = z.infer<typeof ModalitySchema>;

export const MODALITY_LABELS: Record<Modality, string> = {
  online: 'En línea',
  in_person: 'Presencial',
  blended: 'Mixta',
};

/** Tratamiento tributario de una edición (Q6). */
export const TAX_TREATMENTS = ['taxed', 'exempt'] as const;
export const TaxTreatmentSchema = z.enum(TAX_TREATMENTS);
export type TaxTreatment = z.infer<typeof TaxTreatmentSchema>;

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  taxed: 'IVA incluido',
  exempt: 'Exento de IVA',
};

/** Slug de URL: minúsculas, números y guiones. */
export const SlugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Debe contener solo minúsculas, números y guiones');

/**
 * Cupos disponibles: capacidad menos inscripciones vigentes y reservas activas.
 * Nunca negativo (una edición puede quedar sobrevendida si se reducen los cupos).
 */
export function availableSeats(capacity: number, taken: number, reserved: number): number {
  return Math.max(0, capacity - taken - reserved);
}
