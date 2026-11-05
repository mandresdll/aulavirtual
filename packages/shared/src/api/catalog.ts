import { z } from 'zod';
import { SlugSchema, ModalitySchema, TaxTreatmentSchema } from '../domain/catalog.js';
import { CommunityProfileSchema } from '../domain/roles.js';
import { ClpAmountSchema } from '../domain/money.js';

/** Esquemas de la API pública del catálogo (RF-01). Fechas en ISO 8601 UTC. */

export const AreaSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  courseCount: z.number().int().nonnegative(),
});
export type Area = z.infer<typeof AreaSchema>;

export const AreasResponseSchema = z.object({ items: z.array(AreaSchema) });
export type AreasResponse = z.infer<typeof AreasResponseSchema>;

export const InstructorSchema = z.object({
  name: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
});
export type Instructor = z.infer<typeof InstructorSchema>;

export const EditionSchema = z.object({
  id: z.string(),
  code: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  enrollmentOpensAt: z.iso.datetime().nullable(),
  enrollmentClosesAt: z.iso.datetime(),
  priceClp: ClpAmountSchema,
  taxTreatment: TaxTreatmentSchema,
  capacity: z.number().int().nonnegative(),
  availableSeats: z.number().int().nonnegative(),
  /** Inscripciones abiertas ahora (dentro del plazo). Con 0 cupos, corresponde lista de espera. */
  enrollmentOpen: z.boolean(),
  freeForCommunity: z.boolean(),
  /** Perfiles de la comunidad CFT que se inscriben sin pago (RF-04). */
  communityProfiles: z.array(CommunityProfileSchema),
  schedule: z.string().nullable(),
  location: z.string().nullable(),
});
export type Edition = z.infer<typeof EditionSchema>;

export const CourseCardSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  modality: ModalitySchema,
  durationHours: z.number().int().positive(),
  area: z.object({ slug: z.string(), name: z.string() }),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
  featured: z.boolean(),
  /** Próxima edición vigente (la que se muestra en la tarjeta), si existe. */
  nextEdition: EditionSchema.nullable(),
});
export type CourseCard = z.infer<typeof CourseCardSchema>;

export const CourseDetailSchema = CourseCardSchema.extend({
  description: z.string(),
  objectives: z.array(z.string()),
  contents: z.array(z.string()),
  requirements: z.string().nullable(),
  certificationInfo: z.string().nullable(),
  instructors: z.array(InstructorSchema),
  /** Ediciones publicadas que aún no terminan, ordenadas por fecha de inicio. */
  editions: z.array(EditionSchema),
  updatedAt: z.iso.datetime(),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

export const CATALOG_PAGE_SIZE_DEFAULT = 12;
export const CATALOG_PAGE_SIZE_MAX = 48;

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Filtros del listado. `desde`/`hasta` filtran por fecha de inicio (hora de Punta Arenas). */
export const CourseListQuerySchema = z
  .object({
    q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
    area: z.preprocess(emptyToUndefined, SlugSchema.optional()),
    modality: z.preprocess(emptyToUndefined, ModalitySchema.optional()),
    from: z.preprocess(emptyToUndefined, z.iso.date('Fecha inválida (AAAA-MM-DD)').optional()),
    to: z.preprocess(emptyToUndefined, z.iso.date('Fecha inválida (AAAA-MM-DD)').optional()),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(CATALOG_PAGE_SIZE_MAX)
      .default(CATALOG_PAGE_SIZE_DEFAULT),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'La fecha "desde" debe ser anterior o igual a la fecha "hasta"',
    path: ['to'],
  });
export type CourseListQuery = z.infer<typeof CourseListQuerySchema>;

export const CourseListResponseSchema = z.object({
  items: z.array(CourseCardSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type CourseListResponse = z.infer<typeof CourseListResponseSchema>;

export const FeaturedCoursesResponseSchema = z.object({ items: z.array(CourseCardSchema) });
export type FeaturedCoursesResponse = z.infer<typeof FeaturedCoursesResponseSchema>;
