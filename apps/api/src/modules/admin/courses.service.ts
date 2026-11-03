import type {
  AdminCourseDetail,
  AdminCourseListQuery,
  AdminCourseListResponse,
  AdminEdition,
  CourseInput,
  CourseStatus,
  EditionInput,
  EditionStatus,
} from '@plataforma/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { changedFields } from '../../plugins/audit.js';
import type { AdminServiceDeps } from './areas.service.js';
import { mapPrismaError, paginate, type AuditActor } from './support.js';

type Tx = Prisma.TransactionClient;

const COURSE_NOT_FOUND = 'El curso no existe.';
const EDITION_NOT_FOUND = 'La edición no existe.';
const DUPLICATE_SLUG = 'Ya existe un curso con ese identificador (slug).';
const DUPLICATE_CODE = 'Ya existe una edición con ese código.';

const courseInclude = {
  instructors: { orderBy: { position: 'asc' }, select: { instructorId: true } },
  editions: {
    orderBy: { startsAt: 'asc' },
    include: { _count: { select: { enrollments: { where: { status: { not: 'withdrawn' } } } } } },
  },
} satisfies Prisma.CourseInclude;

type CourseRow = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;
type EditionRow = Prisma.CourseEditionGetPayload<object>;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

/** Campos editables de un curso (para el diff de auditoría). */
function courseFields(course: Omit<CourseRow, 'editions'>) {
  return {
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    description: course.description,
    objectives: course.objectives,
    contents: course.contents,
    requirements: course.requirements,
    certificationInfo: course.certificationInfo,
    modality: course.modality,
    durationHours: course.durationHours,
    areaId: course.areaId,
    imageUrl: course.imageUrl,
    imageAlt: course.imageAlt,
    featured: course.featured,
    seoTitle: course.seoTitle,
    seoDescription: course.seoDescription,
    instructorIds: course.instructors.map((item) => item.instructorId),
  };
}

/** Campos editables de una edición (para el diff de auditoría: precio, cupos, fechas…). */
function editionFields(edition: EditionRow) {
  return {
    code: edition.code,
    startsAt: iso(edition.startsAt),
    endsAt: iso(edition.endsAt),
    enrollmentOpensAt: isoOrNull(edition.enrollmentOpensAt),
    enrollmentClosesAt: iso(edition.enrollmentClosesAt),
    capacity: edition.capacity,
    priceClp: edition.priceClp,
    taxTreatment: edition.taxTreatment,
    schedule: edition.schedule,
    location: edition.location,
    moodleCourseId: edition.moodleCourseId,
    passingCriterion: edition.passingCriterion,
    passingGrade: edition.passingGrade === null ? null : edition.passingGrade.toNumber(),
    certificateTemplate: edition.certificateTemplate,
    freeForCommunity: edition.freeForCommunity,
    communityProfiles: edition.communityProfiles,
  };
}

function toAdminEdition(edition: EditionRow, enrollmentCount: number): AdminEdition {
  return {
    ...editionFields(edition),
    id: edition.id,
    courseId: edition.courseId,
    status: edition.status,
    enrollmentCount,
    updatedAt: iso(edition.updatedAt),
  };
}

function toAdminCourse(course: CourseRow): AdminCourseDetail {
  return {
    ...courseFields(course),
    id: course.id,
    status: course.status,
    publishedAt: isoOrNull(course.publishedAt),
    updatedAt: iso(course.updatedAt),
    editions: course.editions.map(({ _count, ...edition }) =>
      toAdminEdition(edition, _count.enrollments),
    ),
  };
}

function editionData(input: EditionInput) {
  return {
    ...input,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    enrollmentOpensAt: input.enrollmentOpensAt ? new Date(input.enrollmentOpensAt) : null,
    enrollmentClosesAt: new Date(input.enrollmentClosesAt),
    passingGrade: input.passingCriterion === 'grade' ? input.passingGrade : null,
  };
}

async function assertReferences(tx: Tx, input: CourseInput): Promise<void> {
  const area = await tx.area.findUnique({ where: { id: input.areaId }, select: { id: true } });
  if (!area) throw new AppError(400, 'INVALID_AREA', 'El área seleccionada no existe.');
  const unique = [...new Set(input.instructorIds)];
  if (unique.length !== input.instructorIds.length) {
    throw new AppError(400, 'DUPLICATE_INSTRUCTOR', 'Un docente aparece más de una vez.');
  }
  const found = await tx.instructor.count({ where: { id: { in: unique } } });
  if (found !== unique.length) {
    throw new AppError(
      400,
      'INVALID_INSTRUCTOR',
      'Alguno de los docentes seleccionados no existe.',
    );
  }
}

/**
 * Cursos y sus ediciones en el panel (RF-07). Los cursos no se borran: se archivan (pueden
 * tener órdenes e inscripciones). Una edición solo se elimina mientras es un borrador sin uso.
 * Cada cambio se audita en la misma transacción e invalida la caché pública del catálogo.
 */
export class AdminCoursesService {
  constructor(private readonly deps: AdminServiceDeps) {}

  async list(query: AdminCourseListQuery): Promise<AdminCourseListResponse> {
    const where: Prisma.CourseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, courses] = await this.deps.prisma.$transaction([
      this.deps.prisma.course.count({ where }),
      this.deps.prisma.course.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          area: { select: { id: true, name: true } },
          _count: { select: { editions: true } },
        },
      }),
    ]);
    return {
      items: courses.map((course) => ({
        id: course.id,
        slug: course.slug,
        title: course.title,
        status: course.status,
        featured: course.featured,
        area: course.area,
        editionCount: course._count.editions,
        updatedAt: iso(course.updatedAt),
      })),
      ...paginate(query.page, query.pageSize, total),
    };
  }

  async get(id: string): Promise<AdminCourseDetail> {
    const course = await this.deps.prisma.course.findUnique({
      where: { id },
      include: courseInclude,
    });
    if (!course) throw AppError.notFound(COURSE_NOT_FOUND);
    return toAdminCourse(course);
  }

  async create(input: CourseInput, actor: AuditActor): Promise<AdminCourseDetail> {
    const { instructorIds, ...data } = input;
    const course = await this.deps.prisma
      .$transaction(async (tx) => {
        await assertReferences(tx, input);
        const created = await tx.course.create({
          data: {
            ...data,
            status: 'draft',
            instructors: {
              create: instructorIds.map((instructorId, position) => ({ instructorId, position })),
            },
          },
          include: courseInclude,
        });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'course.create',
            entityType: 'course',
            entityId: created.id,
            after: courseFields(created),
          },
          tx,
        );
        return created;
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_SLUG }));
    // Es un borrador: el catálogo público no cambia.
    return toAdminCourse(course);
  }

  async update(id: string, input: CourseInput, actor: AuditActor): Promise<AdminCourseDetail> {
    const { instructorIds, ...data } = input;
    const { before, after } = await this.deps.prisma
      .$transaction(async (tx) => {
        const previous = await tx.course.findUnique({ where: { id }, include: courseInclude });
        if (!previous) throw AppError.notFound(COURSE_NOT_FOUND);
        await assertReferences(tx, input);
        await tx.courseInstructor.deleteMany({ where: { courseId: id } });
        const updated = await tx.course.update({
          where: { id },
          data: {
            ...data,
            instructors: {
              create: instructorIds.map((instructorId, position) => ({ instructorId, position })),
            },
          },
          include: courseInclude,
        });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'course.update',
            entityType: 'course',
            entityId: id,
            ...changedFields(courseFields(previous), courseFields(updated)),
          },
          tx,
        );
        return { before: previous, after: updated };
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_SLUG }));
    await this.deps.invalidator.coursesChanged([before.slug, after.slug]);
    return toAdminCourse(after);
  }

  /** Publica, despublica (vuelve a borrador) o archiva. */
  async setStatus(id: string, status: CourseStatus, actor: AuditActor): Promise<AdminCourseDetail> {
    const course = await this.deps.prisma.$transaction(async (tx) => {
      const previous = await tx.course.findUnique({ where: { id }, select: { status: true } });
      if (!previous) throw AppError.notFound(COURSE_NOT_FOUND);
      const updated = await tx.course.update({
        where: { id },
        data: {
          status,
          ...(status === 'published' ? { publishedAt: new Date() } : {}),
        },
        include: courseInclude,
      });
      await this.deps.audit.record(
        {
          ...actor,
          action: STATUS_ACTIONS[status],
          entityType: 'course',
          entityId: id,
          before: { status: previous.status },
          after: { status },
        },
        tx,
      );
      return updated;
    });
    await this.deps.invalidator.coursesChanged([course.slug]);
    return toAdminCourse(course);
  }

  async createEdition(
    courseId: string,
    input: EditionInput,
    actor: AuditActor,
  ): Promise<AdminEdition> {
    return this.deps.prisma
      .$transaction(async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          select: { id: true },
        });
        if (!course) throw AppError.notFound(COURSE_NOT_FOUND);
        const edition = await tx.courseEdition.create({
          data: { ...editionData(input), courseId, status: 'draft' },
        });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'edition.create',
            entityType: 'course_edition',
            entityId: edition.id,
            after: { courseId, ...editionFields(edition) },
          },
          tx,
        );
        return toAdminEdition(edition, 0);
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_CODE }));
  }

  async updateEdition(id: string, input: EditionInput, actor: AuditActor): Promise<AdminEdition> {
    const { edition, slug, enrollments } = await this.deps.prisma
      .$transaction(async (tx) => {
        const previous = await tx.courseEdition.findUnique({ where: { id } });
        if (!previous) throw AppError.notFound(EDITION_NOT_FOUND);
        const updated = await tx.courseEdition.update({
          where: { id },
          data: editionData(input),
          include: {
            course: { select: { slug: true } },
            _count: {
              select: { enrollments: { where: { status: { not: 'withdrawn' } } } },
            },
          },
        });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'edition.update',
            entityType: 'course_edition',
            entityId: id,
            ...changedFields(editionFields(previous), editionFields(updated)),
          },
          tx,
        );
        return {
          edition: updated,
          slug: updated.course.slug,
          enrollments: updated._count.enrollments,
        };
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_CODE }));
    await this.deps.invalidator.coursesChanged([slug]);
    return toAdminEdition(edition, enrollments);
  }

  /** Publica o despublica (vuelve a borrador) una edición. */
  async setEditionStatus(
    id: string,
    status: Extract<EditionStatus, 'draft' | 'published'>,
    actor: AuditActor,
  ): Promise<AdminEdition> {
    const { edition, slug, enrollments } = await this.deps.prisma.$transaction(async (tx) => {
      const previous = await tx.courseEdition.findUnique({ where: { id } });
      if (!previous) throw AppError.notFound(EDITION_NOT_FOUND);
      if (previous.status === 'finished' || previous.status === 'cancelled') {
        throw AppError.conflict(
          'EDITION_CLOSED',
          'No se puede cambiar la publicación de una edición finalizada o cancelada.',
        );
      }
      const updated = await tx.courseEdition.update({
        where: { id },
        data: { status },
        include: {
          course: { select: { slug: true } },
          _count: { select: { enrollments: { where: { status: { not: 'withdrawn' } } } } },
        },
      });
      await this.deps.audit.record(
        {
          ...actor,
          action: status === 'published' ? 'edition.publish' : 'edition.unpublish',
          entityType: 'course_edition',
          entityId: id,
          before: { status: previous.status },
          after: { status },
        },
        tx,
      );
      return {
        edition: updated,
        slug: updated.course.slug,
        enrollments: updated._count.enrollments,
      };
    });
    await this.deps.invalidator.coursesChanged([slug]);
    return toAdminEdition(edition, enrollments);
  }

  /** Copia una edición como borrador con un código nuevo (mismas condiciones, sin inscritos). */
  async duplicateEdition(id: string, code: string, actor: AuditActor): Promise<AdminEdition> {
    return this.deps.prisma
      .$transaction(async (tx) => {
        const source = await tx.courseEdition.findUnique({ where: { id } });
        if (!source) throw AppError.notFound(EDITION_NOT_FOUND);
        const edition = await tx.courseEdition.create({
          data: {
            ...editionData({
              ...editionFields(source),
              code,
              passingGrade: editionFields(source).passingGrade,
            }),
            courseId: source.courseId,
            status: 'draft',
          },
        });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'edition.duplicate',
            entityType: 'course_edition',
            entityId: edition.id,
            before: { sourceEditionId: id, code: source.code },
            after: editionFields(edition),
          },
          tx,
        );
        return toAdminEdition(edition, 0);
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_CODE }));
  }

  /**
   * Elimina una edición en borrador que nunca se usó. Con inscripciones, órdenes, reservas o
   * lista de espera debe quedar en la historia: se despublica en vez de borrarse.
   */
  async deleteEdition(id: string, actor: AuditActor): Promise<void> {
    await this.deps.prisma
      .$transaction(async (tx) => {
        const edition = await tx.courseEdition.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                enrollments: true,
                orderItems: true,
                seatReservations: true,
                waitlistEntries: true,
                cartItems: true,
                coupons: true,
              },
            },
          },
        });
        if (!edition) throw AppError.notFound(EDITION_NOT_FOUND);
        const { _count, ...row } = edition;
        if (row.status !== 'draft' || Object.values(_count).some((count) => count > 0)) {
          throw editionInUse();
        }
        await tx.courseEdition.delete({ where: { id } });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'edition.delete',
            entityType: 'course_edition',
            entityId: id,
            before: { courseId: row.courseId, ...editionFields(row) },
          },
          tx,
        );
      })
      .catch((error: unknown) =>
        mapPrismaError(error, { inUse: editionInUse().message, notFound: EDITION_NOT_FOUND }),
      );
  }
}

const STATUS_ACTIONS: Record<CourseStatus, string> = {
  published: 'course.publish',
  draft: 'course.unpublish',
  archived: 'course.archive',
};

const editionInUse = () =>
  AppError.conflict(
    'IN_USE',
    'Solo se pueden eliminar ediciones en borrador sin inscripciones, órdenes ni reservas. ' +
      'Despublícala para ocultarla.',
  );
