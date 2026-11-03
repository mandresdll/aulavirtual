import type { AdminArea, AdminInstructor, AreaInput, InstructorInput } from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { changedFields, type AuditRecorder } from '../../plugins/audit.js';
import { mapPrismaError, type AuditActor, type CatalogCacheInvalidator } from './support.js';

export interface AdminServiceDeps {
  prisma: PrismaClient;
  audit: AuditRecorder;
  invalidator: CatalogCacheInvalidator;
}

const AREA_NOT_FOUND = 'El área no existe.';
const INSTRUCTOR_NOT_FOUND = 'El docente no existe.';

const areaFields = (area: { slug: string; name: string; description: string | null }) => ({
  slug: area.slug,
  name: area.name,
  description: area.description,
});

const instructorFields = (instructor: {
  name: string;
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
}) => ({
  name: instructor.name,
  title: instructor.title,
  bio: instructor.bio,
  photoUrl: instructor.photoUrl,
});

/** Áreas temáticas del catálogo (RF-07). Solo se eliminan si ningún curso las usa. */
export class AdminAreasService {
  constructor(private readonly deps: AdminServiceDeps) {}

  async list(): Promise<AdminArea[]> {
    const areas = await this.deps.prisma.area.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return areas.map(({ _count, ...area }) => ({
      ...areaFields(area),
      id: area.id,
      courseCount: _count.courses,
    }));
  }

  async create(input: AreaInput, actor: AuditActor): Promise<AdminArea> {
    const { prisma, audit, invalidator } = this.deps;
    const area = await prisma
      .$transaction(async (tx) => {
        const created = await tx.area.create({ data: input });
        await audit.record(
          {
            ...actor,
            action: 'area.create',
            entityType: 'area',
            entityId: created.id,
            after: areaFields(created),
          },
          tx,
        );
        return created;
      })
      .catch((error: unknown) =>
        mapPrismaError(error, { unique: 'Ya existe un área con ese identificador (slug).' }),
      );
    await invalidator.coursesChanged([]);
    return { ...areaFields(area), id: area.id, courseCount: 0 };
  }

  async update(id: string, input: AreaInput, actor: AuditActor): Promise<AdminArea> {
    const { prisma, audit, invalidator } = this.deps;
    const { area, slugs } = await prisma
      .$transaction(async (tx) => {
        const before = await tx.area.findUnique({ where: { id } });
        if (!before) throw AppError.notFound(AREA_NOT_FOUND);
        const updated = await tx.area.update({
          where: { id },
          data: input,
          include: { courses: { select: { slug: true } } },
        });
        await audit.record(
          {
            ...actor,
            action: 'area.update',
            entityType: 'area',
            entityId: id,
            ...changedFields(areaFields(before), areaFields(updated)),
          },
          tx,
        );
        return { area: updated, slugs: updated.courses.map((course) => course.slug) };
      })
      .catch((error: unknown) =>
        mapPrismaError(error, { unique: 'Ya existe un área con ese identificador (slug).' }),
      );
    await invalidator.coursesChanged(slugs);
    return { ...areaFields(area), id: area.id, courseCount: slugs.length };
  }

  async delete(id: string, actor: AuditActor): Promise<void> {
    const { prisma, audit, invalidator } = this.deps;
    await prisma
      .$transaction(async (tx) => {
        const before = await tx.area.findUnique({
          where: { id },
          include: { _count: { select: { courses: true } } },
        });
        if (!before) throw AppError.notFound(AREA_NOT_FOUND);
        if (before._count.courses > 0) throw areaInUse();
        await tx.area.delete({ where: { id } });
        await audit.record(
          {
            ...actor,
            action: 'area.delete',
            entityType: 'area',
            entityId: id,
            before: areaFields(before),
          },
          tx,
        );
      })
      .catch((error: unknown) =>
        mapPrismaError(error, { inUse: areaInUse().message, notFound: AREA_NOT_FOUND }),
      );
    await invalidator.coursesChanged([]);
  }
}

const areaInUse = () =>
  AppError.conflict(
    'IN_USE',
    'No se puede eliminar el área porque tiene cursos. Cambia el área de esos cursos primero.',
  );
const instructorInUse = () =>
  AppError.conflict(
    'IN_USE',
    'No se puede eliminar el docente porque está asignado a cursos. Quítalo de esos cursos primero.',
  );

/** Docentes que se muestran en las fichas (RF-07). Solo se eliminan si no están en cursos. */
export class AdminInstructorsService {
  constructor(private readonly deps: AdminServiceDeps) {}

  async list(): Promise<AdminInstructor[]> {
    const instructors = await this.deps.prisma.instructor.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
    return instructors.map(({ _count, ...instructor }) => ({
      ...instructorFields(instructor),
      id: instructor.id,
      courseCount: _count.courses,
    }));
  }

  async create(input: InstructorInput, actor: AuditActor): Promise<AdminInstructor> {
    const { prisma, audit } = this.deps;
    const instructor = await prisma.$transaction(async (tx) => {
      const created = await tx.instructor.create({ data: input });
      await audit.record(
        {
          ...actor,
          action: 'instructor.create',
          entityType: 'instructor',
          entityId: created.id,
          after: instructorFields(created),
        },
        tx,
      );
      return created;
    });
    return { ...instructorFields(instructor), id: instructor.id, courseCount: 0 };
  }

  async update(id: string, input: InstructorInput, actor: AuditActor): Promise<AdminInstructor> {
    const { prisma, audit, invalidator } = this.deps;
    const { instructor, slugs } = await prisma.$transaction(async (tx) => {
      const before = await tx.instructor.findUnique({ where: { id } });
      if (!before) throw AppError.notFound(INSTRUCTOR_NOT_FOUND);
      const updated = await tx.instructor.update({
        where: { id },
        data: input,
        include: { courses: { select: { course: { select: { slug: true } } } } },
      });
      await audit.record(
        {
          ...actor,
          action: 'instructor.update',
          entityType: 'instructor',
          entityId: id,
          ...changedFields(instructorFields(before), instructorFields(updated)),
        },
        tx,
      );
      return { instructor: updated, slugs: updated.courses.map((item) => item.course.slug) };
    });
    await invalidator.coursesChanged(slugs);
    return { ...instructorFields(instructor), id: instructor.id, courseCount: slugs.length };
  }

  async delete(id: string, actor: AuditActor): Promise<void> {
    const { prisma, audit } = this.deps;
    await prisma
      .$transaction(async (tx) => {
        const before = await tx.instructor.findUnique({
          where: { id },
          include: { _count: { select: { courses: true } } },
        });
        if (!before) throw AppError.notFound(INSTRUCTOR_NOT_FOUND);
        if (before._count.courses > 0) throw instructorInUse();
        await tx.instructor.delete({ where: { id } });
        await audit.record(
          {
            ...actor,
            action: 'instructor.delete',
            entityType: 'instructor',
            entityId: id,
            before: instructorFields(before),
          },
          tx,
        );
      })
      .catch((error: unknown) =>
        mapPrismaError(error, {
          inUse: instructorInUse().message,
          notFound: INSTRUCTOR_NOT_FOUND,
        }),
      );
  }
}
