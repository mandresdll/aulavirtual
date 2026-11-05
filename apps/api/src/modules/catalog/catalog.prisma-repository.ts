import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  AreaRecord,
  CatalogRepository,
  CourseDetailRecord,
  CourseRecord,
  CourseSearch,
  SeatUsage,
} from './catalog.repository.js';

const editionSelect = {
  id: true,
  code: true,
  startsAt: true,
  endsAt: true,
  enrollmentOpensAt: true,
  enrollmentClosesAt: true,
  priceClp: true,
  taxTreatment: true,
  capacity: true,
  freeForCommunity: true,
  communityProfiles: true,
  schedule: true,
  location: true,
} satisfies Prisma.CourseEditionSelect;

function visibleEditions(now: Date) {
  return {
    where: { status: 'published', endsAt: { gte: now } },
    orderBy: [{ startsAt: 'asc' }, { code: 'asc' }],
    select: editionSelect,
  } satisfies Prisma.Course$editionsArgs;
}

function courseSelect(now: Date) {
  return {
    id: true,
    slug: true,
    title: true,
    summary: true,
    modality: true,
    durationHours: true,
    imageUrl: true,
    imageAlt: true,
    featured: true,
    updatedAt: true,
    area: { select: { slug: true, name: true } },
    editions: visibleEditions(now),
  } satisfies Prisma.CourseSelect;
}

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async searchCourses(search: CourseSearch): Promise<{ total: number; items: CourseRecord[] }> {
    const tsQuery = search.tsQuery
      ? Prisma.sql`to_tsquery('spanish', immutable_unaccent(${search.tsQuery}))`
      : undefined;

    const conditions: Prisma.Sql[] = [Prisma.sql`c.status = 'published'`];
    if (tsQuery) conditions.push(Prisma.sql`c.search @@ ${tsQuery}`);
    if (search.areaSlug) conditions.push(Prisma.sql`a.slug = ${search.areaSlug}`);
    if (search.modality) conditions.push(Prisma.sql`c.modality = ${search.modality}::"Modality"`);
    if (search.startsFrom || search.startsBefore) {
      const range: Prisma.Sql[] = [
        Prisma.sql`e.course_id = c.id`,
        Prisma.sql`e.status = 'published'`,
      ];
      if (search.startsFrom) range.push(Prisma.sql`e.starts_at >= ${search.startsFrom}`);
      if (search.startsBefore) range.push(Prisma.sql`e.starts_at < ${search.startsBefore}`);
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM course_editions e WHERE ${Prisma.join(range, ' AND ')})`,
      );
    }
    const where = Prisma.join(conditions, ' AND ');

    const [countRow] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM courses c JOIN areas a ON a.id = c.area_id
      WHERE ${where}`;
    const total = countRow?.total ?? 0;
    if (total === 0 || search.offset >= total) return { total, items: [] };

    // Orden: relevancia (si hay búsqueda), destacados, próxima edición más cercana y título.
    const rank = tsQuery ? Prisma.sql`ts_rank(c.search, ${tsQuery}) DESC,` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id
      FROM courses c
      JOIN areas a ON a.id = c.area_id
      LEFT JOIN LATERAL (
        SELECT min(e.starts_at) AS next_start
        FROM course_editions e
        WHERE e.course_id = c.id AND e.status = 'published' AND e.ends_at >= ${search.now}
      ) n ON true
      WHERE ${where}
      ORDER BY ${rank} c.featured DESC, n.next_start ASC NULLS LAST, c.title ASC, c.id ASC
      LIMIT ${search.limit} OFFSET ${search.offset}`;

    const ids = rows.map((row) => row.id);
    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      select: courseSelect(search.now),
    });
    const byId = new Map(courses.map((course) => [course.id, course]));
    const items = ids.flatMap((id) => {
      const course = byId.get(id);
      return course ? [course] : [];
    });
    return { total, items };
  }

  async featuredCourses(limit: number, now: Date): Promise<CourseRecord[]> {
    return this.prisma.course.findMany({
      where: { status: 'published', featured: true },
      orderBy: [{ publishedAt: 'desc' }, { title: 'asc' }],
      take: limit,
      select: courseSelect(now),
    });
  }

  async findPublishedCourse(slug: string, now: Date): Promise<CourseDetailRecord | null> {
    const course = await this.prisma.course.findFirst({
      where: { slug, status: 'published' },
      select: {
        ...courseSelect(now),
        description: true,
        objectives: true,
        contents: true,
        requirements: true,
        certificationInfo: true,
        seoTitle: true,
        seoDescription: true,
        instructors: {
          orderBy: { position: 'asc' },
          select: { instructor: { select: { name: true, title: true, bio: true } } },
        },
      },
    });
    if (!course) return null;
    return { ...course, instructors: course.instructors.map((link) => link.instructor) };
  }

  async listAreas(): Promise<AreaRecord[]> {
    const areas = await this.prisma.area.findMany({
      orderBy: { name: 'asc' },
      select: {
        slug: true,
        name: true,
        description: true,
        _count: { select: { courses: { where: { status: 'published' } } } },
      },
    });
    return areas.map(({ _count, ...area }) => ({ ...area, publishedCourses: _count.courses }));
  }

  async seatUsage(editionIds: readonly string[], now: Date): Promise<Map<string, SeatUsage>> {
    const ids = [...editionIds];
    const [enrollments, reservations] = await Promise.all([
      this.prisma.enrollment.groupBy({
        by: ['editionId'],
        where: { editionId: { in: ids }, status: { not: 'withdrawn' } },
        _count: { _all: true },
      }),
      this.prisma.seatReservation.groupBy({
        by: ['editionId'],
        where: { editionId: { in: ids }, status: 'active', expiresAt: { gt: now } },
        _count: { _all: true },
      }),
    ]);
    const usage = new Map<string, SeatUsage>(ids.map((id) => [id, { taken: 0, reserved: 0 }]));
    for (const row of enrollments) {
      const entry = usage.get(row.editionId);
      if (entry) entry.taken = row._count._all;
    }
    for (const row of reservations) {
      const entry = usage.get(row.editionId);
      if (entry) entry.reserved = row._count._all;
    }
    return usage;
  }

  async publishedCourseSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
    return this.prisma.course.findMany({
      where: { status: 'published' },
      orderBy: { slug: 'asc' },
      select: { slug: true, updatedAt: true },
    });
  }
}
