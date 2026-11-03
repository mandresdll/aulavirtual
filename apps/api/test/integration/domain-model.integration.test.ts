import { Prisma, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_COUPON_CODE, seedDemoData } from '../../src/db/demo-seed.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/** Restricciones del modelo de dominio que viven en la BD (no solo en el código). */
const env = integrationEnv();
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function createEdition(capacity = 10) {
  const area = await prisma.area.create({
    data: { slug: `area-${capacity}-${Date.now()}`, name: 'Área' },
  });
  const course = await prisma.course.create({
    data: {
      slug: `curso-${capacity}-${Date.now()}`,
      title: 'Curso',
      summary: 'Resumen',
      description: 'Descripción',
      modality: 'online',
      durationHours: 10,
      areaId: area.id,
    },
  });
  return prisma.courseEdition.create({
    data: {
      courseId: course.id,
      code: `ED-${capacity}-${Date.now()}`,
      startsAt: daysFromNow(10),
      endsAt: daysFromNow(40),
      enrollmentClosesAt: daysFromNow(5),
      capacity,
      priceClp: 10_000,
    },
  });
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return undefined;
}

describe('domain constraints', () => {
  it('allows a single enrollment per user and edition', async () => {
    const edition = await createEdition();
    const user = await prisma.user.create({ data: { email: 'unico@example.com', name: 'Único' } });
    const data = { userId: user.id, editionId: edition.id, source: 'purchase' as const };
    await prisma.enrollment.create({ data });
    const duplicate = await prisma.enrollment.create({ data }).catch((error: unknown) => error);
    expect(errorCode(duplicate)).toBe('P2002');
  });

  it('rejects negative prices and inconsistent order totals', async () => {
    const edition = await createEdition(11);
    await expect(
      prisma.courseEdition.update({ where: { id: edition.id }, data: { priceClp: -1 } }),
    ).rejects.toThrow(/course_editions_price_check/);

    const user = await prisma.user.create({ data: { email: 'totales@example.com', name: 'T' } });
    await expect(
      prisma.order.create({
        data: {
          number: 'TEST-TOTALS',
          userId: user.id,
          subtotalClp: 10_000,
          discountClp: 1_000,
          totalClp: 10_000,
        },
      }),
    ).rejects.toThrow(/orders_amounts_check/);
  });

  it('never deletes orders and keeps the audit log append-only', async () => {
    const user = await prisma.user.create({ data: { email: 'orden@example.com', name: 'O' } });
    const order = await prisma.order.create({
      data: { number: `TEST-${Date.now()}`, userId: user.id, subtotalClp: 0, totalClp: 0 },
    });
    await expect(prisma.order.delete({ where: { id: order.id } })).rejects.toThrow(
      /DELETE on table orders is not allowed/,
    );

    const entry = await prisma.auditLog.create({
      data: { action: 'test.created', entityType: 'test', entityId: '1' },
    });
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/UPDATE on table audit_logs is not allowed/);
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
      /DELETE on table audit_logs is not allowed/,
    );
    await expect(prisma.$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow(
      /TRUNCATE on table audit_logs is not allowed/,
    );
  });

  it('keeps the search document in sync when a course changes', async () => {
    const edition = await createEdition(12);
    const course = await prisma.course.update({
      where: { id: edition.courseId },
      data: { title: 'Fotografía submarina', status: 'published' },
    });
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM courses
      WHERE search @@ to_tsquery('spanish', immutable_unaccent('fotografia:*'))`;
    expect(rows.map((row) => row.id)).toEqual([course.id]);
  });
});

describe('demo seed', () => {
  it('loads the demo catalog and can run twice without duplicating data', async () => {
    await resetCatalogData(prisma);
    const first = await seedDemoData(prisma);
    const counts = async () => ({
      areas: await prisma.area.count(),
      courses: await prisma.course.count({ where: { status: 'published' } }),
      editions: await prisma.courseEdition.count(),
      enrollments: await prisma.enrollment.count(),
      coupons: await prisma.coupon.count({ where: { code: DEMO_COUPON_CODE } }),
    });
    const before = await counts();
    await seedDemoData(prisma);

    expect(await counts()).toEqual(before);
    expect(first).toEqual({ areas: 2, courses: 4, editions: 5, users: 6 });
    expect(before).toMatchObject({ areas: 2, courses: 4, editions: 5, coupons: 1 });

    // La edición de demostración sin cupos está completa.
    const soldOut = await prisma.courseEdition.findUniqueOrThrow({
      where: { code: 'SEG-DEMO-1' },
      include: { _count: { select: { enrollments: true } } },
    });
    expect(soldOut._count.enrollments).toBe(soldOut.capacity);
  });
});
