import { z } from 'zod';
import { ModalitySchema, SlugSchema, TaxTreatmentSchema } from '../domain/catalog.js';
import { ClpAmountSchema } from '../domain/money.js';
import { CommunityProfileSchema } from '../domain/roles.js';

/**
 * Esquemas del panel de administración (RF-07) y de la vista de auditoría (RF-12).
 * Fechas en ISO 8601 UTC; la SPA convierte desde y hacia la hora de Punta Arenas.
 */

const IdSchema = z.uuid('Identificador inválido');
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const text = (max: number) =>
  z.string().trim().min(1, 'Este campo es obligatorio').max(max, `Máximo ${max} caracteres`);
/** Texto opcional: vacío se guarda como `null`. */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `Máximo ${max} caracteres`).nullable(),
  );
/** Imagen: ruta interna (`/img/...`) o URL https. */
const ImageUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(500)
    .regex(/^(\/(?![/\\])\S*|https:\/\/\S+)$/, 'Debe ser una ruta interna (/img/…) o una URL https')
    .nullable(),
);

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });

export const IdParamsSchema = z.object({ id: IdSchema });

// --- Áreas ---------------------------------------------------------------------------------

export const AreaInputSchema = z.object({
  slug: SlugSchema,
  name: text(150),
  description: optionalText(2000).default(null),
});
export type AreaInput = z.infer<typeof AreaInputSchema>;

export const AdminAreaSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  courseCount: z.number().int().nonnegative(),
});
export type AdminArea = z.infer<typeof AdminAreaSchema>;

export const AdminAreasResponseSchema = z.object({ items: z.array(AdminAreaSchema) });

// --- Docentes ------------------------------------------------------------------------------

export const InstructorInputSchema = z.object({
  name: text(200),
  title: optionalText(200).default(null),
  bio: optionalText(3000).default(null),
  photoUrl: ImageUrlSchema.default(null),
});
export type InstructorInput = z.infer<typeof InstructorInputSchema>;

export const AdminInstructorSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  courseCount: z.number().int().nonnegative(),
});
export type AdminInstructor = z.infer<typeof AdminInstructorSchema>;

export const AdminInstructorsResponseSchema = z.object({ items: z.array(AdminInstructorSchema) });

// --- Cursos --------------------------------------------------------------------------------

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export const CourseStatusSchema = z.enum(COURSE_STATUSES);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const listItems = z.array(text(300)).max(30, 'Máximo 30 elementos');

export const CourseInputSchema = z.object({
  slug: SlugSchema,
  title: text(200),
  summary: text(500),
  description: text(20_000),
  objectives: listItems.default([]),
  contents: listItems.default([]),
  requirements: optionalText(2000).default(null),
  certificationInfo: optionalText(2000).default(null),
  modality: ModalitySchema,
  durationHours: z.number().int().min(1, 'Mínimo 1 hora').max(2000),
  areaId: IdSchema,
  imageUrl: ImageUrlSchema.default(null),
  imageAlt: optionalText(300).default(null),
  featured: z.boolean().default(false),
  seoTitle: optionalText(70).default(null),
  seoDescription: optionalText(170).default(null),
  /** Docentes en el orden en que se muestran en la ficha. */
  instructorIds: z.array(IdSchema).max(10).default([]),
});
export type CourseInput = z.infer<typeof CourseInputSchema>;

export const AdminCourseListQuerySchema = PaginationQuerySchema.extend({
  q: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  status: z.preprocess(blankToUndefined, CourseStatusSchema.optional()),
});
export type AdminCourseListQuery = z.infer<typeof AdminCourseListQuerySchema>;

export const AdminCourseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: CourseStatusSchema,
  featured: z.boolean(),
  area: z.object({ id: z.string(), name: z.string() }),
  editionCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type AdminCourseSummary = z.infer<typeof AdminCourseSummarySchema>;

export const AdminCourseListResponseSchema = paginated(AdminCourseSummarySchema);
export type AdminCourseListResponse = z.infer<typeof AdminCourseListResponseSchema>;

// --- Ediciones -----------------------------------------------------------------------------

export const EDITION_STATUSES = ['draft', 'published', 'closed', 'finished', 'cancelled'] as const;
export const EditionStatusSchema = z.enum(EDITION_STATUSES);
export type EditionStatus = z.infer<typeof EditionStatusSchema>;

export const EDITION_STATUS_LABELS: Record<EditionStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  closed: 'Inscripciones cerradas',
  finished: 'Finalizada',
  cancelled: 'Cancelada',
};

export const PASSING_CRITERIA = ['completion', 'grade'] as const;
export const PassingCriterionSchema = z.enum(PASSING_CRITERIA);
export type PassingCriterion = z.infer<typeof PassingCriterionSchema>;

export const PASSING_CRITERION_LABELS: Record<PassingCriterion, string> = {
  completion: 'Finalización del curso',
  grade: 'Nota mínima',
};

/** Código legible y único de la edición, p. ej. `JS-2026-1`. */
export const EditionCodeSchema = z
  .string()
  .trim()
  .min(2, 'Mínimo 2 caracteres')
  .max(40, 'Máximo 40 caracteres')
  .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'Usa mayúsculas, números y guiones (p. ej. JS-2026-1)');

export const EditionInputSchema = z
  .object({
    code: EditionCodeSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    enrollmentOpensAt: z.iso.datetime().nullable().default(null),
    enrollmentClosesAt: z.iso.datetime(),
    capacity: z.number().int().min(0).max(10_000),
    priceClp: ClpAmountSchema,
    taxTreatment: TaxTreatmentSchema.default('exempt'),
    schedule: optionalText(300).default(null),
    location: optionalText(300).default(null),
    moodleCourseId: optionalText(50).default(null),
    passingCriterion: PassingCriterionSchema.default('completion'),
    passingGrade: z.number().min(1).max(100).nullable().default(null),
    certificateTemplate: optionalText(100).default(null),
    freeForCommunity: z.boolean().default(false),
    communityProfiles: z.array(CommunityProfileSchema).max(3).default([]),
  })
  .superRefine((edition, ctx) => {
    const time = (value: string) => Date.parse(value);
    if (time(edition.endsAt) <= time(edition.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'El término debe ser posterior al inicio',
      });
    }
    if (time(edition.enrollmentClosesAt) > time(edition.endsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['enrollmentClosesAt'],
        message: 'El cierre de inscripciones no puede ser posterior al término',
      });
    }
    if (
      edition.enrollmentOpensAt &&
      time(edition.enrollmentOpensAt) >= time(edition.enrollmentClosesAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['enrollmentOpensAt'],
        message: 'La apertura debe ser anterior al cierre de inscripciones',
      });
    }
    if (edition.passingCriterion === 'grade' && edition.passingGrade === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['passingGrade'],
        message: 'Indica la nota mínima de aprobación',
      });
    }
    if (edition.freeForCommunity && edition.communityProfiles.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['communityProfiles'],
        message: 'Indica qué perfiles de la comunidad CFT se inscriben sin pago',
      });
    }
  });
export type EditionInput = z.infer<typeof EditionInputSchema>;

export const DuplicateEditionInputSchema = z.object({ code: EditionCodeSchema });
export type DuplicateEditionInput = z.infer<typeof DuplicateEditionInputSchema>;

export const AdminEditionSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  code: z.string(),
  status: EditionStatusSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  enrollmentOpensAt: z.iso.datetime().nullable(),
  enrollmentClosesAt: z.iso.datetime(),
  capacity: z.number().int().nonnegative(),
  priceClp: ClpAmountSchema,
  taxTreatment: TaxTreatmentSchema,
  schedule: z.string().nullable(),
  location: z.string().nullable(),
  moodleCourseId: z.string().nullable(),
  passingCriterion: PassingCriterionSchema,
  passingGrade: z.number().nullable(),
  certificateTemplate: z.string().nullable(),
  freeForCommunity: z.boolean(),
  communityProfiles: z.array(CommunityProfileSchema),
  /** Inscripciones no retiradas. */
  enrollmentCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type AdminEdition = z.infer<typeof AdminEditionSchema>;

export const AdminCourseDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  contents: z.array(z.string()),
  requirements: z.string().nullable(),
  certificationInfo: z.string().nullable(),
  modality: ModalitySchema,
  durationHours: z.number().int().positive(),
  areaId: z.string(),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
  featured: z.boolean(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  instructorIds: z.array(z.string()),
  status: CourseStatusSchema,
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  editions: z.array(AdminEditionSchema),
});
export type AdminCourseDetail = z.infer<typeof AdminCourseDetailSchema>;

// --- Auditoría (RF-12) ---------------------------------------------------------------------

export const AuditQuerySchema = PaginationQuerySchema.extend({
  /** Días calendario en hora de Punta Arenas (YYYY-MM-DD). */
  from: z.preprocess(blankToUndefined, z.iso.date('Fecha inválida (AAAA-MM-DD)').optional()),
  to: z.preprocess(blankToUndefined, z.iso.date('Fecha inválida (AAAA-MM-DD)').optional()),
  actorId: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  action: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  entityType: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()),
  entityId: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  /** Nombre del usuario de la plataforma, si el actor es uno. */
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  ip: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditListResponseSchema = paginated(AuditLogEntrySchema);
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;
