import type { PrismaClient } from '@prisma/client';
import {
  AreasResponseSchema,
  CourseDetailSchema,
  CourseListResponseSchema,
  type CourseListResponse,
} from '@plataforma/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/**
 * Catálogo contra PostgreSQL real (sin caché, para ver cada cambio de la BD):
 * búsqueda en español, filtros, paginación, visibilidad y cupos.
 */
const env = integrationEnv({ PUBLIC_WEB_URL: 'https://cursos.example.cl' });

let prisma: PrismaClient;
let app: FastifyInstance;
let soldOutEditionId: string;

async function list(query = ''): Promise<CourseListResponse> {
  const response = await app.inject(`/api/catalog/courses${query}`);
  expect(response.statusCode).toBe(200);
  return CourseListResponseSchema.parse(response.json());
}

const slugs = (page: CourseListResponse) => page.items.map((course) => course.slug);

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);

  const tech = await prisma.area.create({ data: { slug: 'tecnologia', name: 'Tecnología' } });
  const business = await prisma.area.create({ data: { slug: 'gestion', name: 'Gestión' } });
  await prisma.area.create({ data: { slug: 'vacia', name: 'Área sin cursos' } });
  const instructor = await prisma.instructor.create({
    data: { name: 'Camila Vidal', title: 'Ingeniera' },
  });

  const base = {
    description: 'Descripción del curso.',
    durationHours: 20,
    status: 'published' as const,
  };
  const programming = await prisma.course.create({
    data: {
      ...base,
      slug: 'programacion-avanzada',
      title: 'Programación avanzada',
      summary: 'Patrones y buenas prácticas.',
      objectives: ['Diseñar aplicaciones mantenibles'],
      contents: ['Pruebas automatizadas', 'Integración continua'],
      modality: 'online',
      areaId: tech.id,
      featured: true,
      instructors: { create: { instructorId: instructor.id } },
    },
  });
  const security = await prisma.course.create({
    data: {
      ...base,
      slug: 'seguridad-informatica',
      title: 'Seguridad informática',
      summary: 'Protege tu información.',
      objectives: [],
      contents: ['Contraseñas', 'Correos fraudulentos'],
      modality: 'blended',
      areaId: tech.id,
    },
  });
  const accounting = await prisma.course.create({
    data: {
      ...base,
      slug: 'contabilidad-basica',
      title: 'Contabilidad básica',
      summary: 'Registros contables para pymes.',
      objectives: [],
      contents: [],
      modality: 'in_person',
      areaId: business.id,
    },
  });
  await prisma.course.create({
    data: {
      ...base,
      slug: 'curso-borrador',
      title: 'Programación en borrador',
      summary: 'No debe publicarse.',
      objectives: [],
      contents: [],
      modality: 'online',
      areaId: tech.id,
      status: 'draft',
    },
  });
  await prisma.course.create({
    data: {
      ...base,
      slug: 'curso-archivado',
      title: 'Programación archivada',
      summary: 'Ya no se dicta.',
      objectives: [],
      contents: [],
      modality: 'online',
      areaId: tech.id,
      status: 'archived',
    },
  });

  const edition = (courseId: string, code: string, startsAt: Date, extra = {}) => ({
    courseId,
    code,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    enrollmentClosesAt: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000),
    capacity: 20,
    priceClp: 50_000,
    status: 'published' as const,
    ...extra,
  });

  // Inicio a las 02:30 UTC del 10 de marzo de 2030 = 23:30 del 9 de marzo en Punta Arenas.
  await prisma.courseEdition.createMany({
    data: [
      edition(programming.id, 'PROG-1', new Date('2030-03-10T02:30:00Z')),
      edition(programming.id, 'PROG-DRAFT', daysFromNow(10), { status: 'draft' }),
      edition(programming.id, 'PROG-OLD', daysFromNow(-90)),
      edition(accounting.id, 'CONT-1', new Date('2030-04-15T13:00:00Z')),
    ],
  });
  const soldOut = await prisma.courseEdition.create({
    data: edition(security.id, 'SEG-1', daysFromNow(20), { capacity: 3 }),
  });
  soldOutEditionId = soldOut.id;

  const [ana, bruno, carla, diego] = await Promise.all(
    ['ana', 'bruno', 'carla', 'diego'].map((name) =>
      prisma.user.create({ data: { email: `${name}@example.com`, name } }),
    ),
  );
  if (!ana || !bruno || !carla || !diego) throw new Error('fixture');
  await prisma.enrollment.createMany({
    data: [
      { userId: ana.id, editionId: soldOut.id, source: 'purchase', status: 'enrolled' },
      { userId: bruno.id, editionId: soldOut.id, source: 'purchase', status: 'withdrawn' },
    ],
  });
  await prisma.seatReservation.createMany({
    data: [
      { userId: carla.id, editionId: soldOut.id, expiresAt: daysFromNow(1) },
      { userId: diego.id, editionId: soldOut.id, expiresAt: daysFromNow(-1) },
      { userId: diego.id, editionId: soldOut.id, expiresAt: daysFromNow(1), status: 'released' },
    ],
  });

  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma,
  });
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
});

describe('catalog search (PostgreSQL full-text, Spanish)', () => {
  it('ignores accents and case', async () => {
    expect(slugs(await list('?q=PROGRAMACION'))).toEqual(['programacion-avanzada']);
    expect(slugs(await list('?q=informática'))).toEqual(['seguridad-informatica']);
  });

  it('matches word prefixes and Spanish word forms', async () => {
    expect(slugs(await list('?q=progra'))).toEqual(['programacion-avanzada']);
    expect(slugs(await list('?q=contable'))).toEqual(['contabilidad-basica']);
  });

  it('searches objectives and contents too', async () => {
    expect(slugs(await list('?q=fraudulentos'))).toEqual(['seguridad-informatica']);
    expect(slugs(await list('?q=mantenibles'))).toEqual(['programacion-avanzada']);
  });

  it('requires every term and survives tsquery syntax in the input', async () => {
    expect(slugs(await list('?q=programacion%20contabilidad'))).toEqual([]);
    expect((await app.inject("/api/catalog/courses?q=')%20%7C%20!(")).statusCode).toBe(200);
  });
});

describe('catalog visibility and filters', () => {
  it('lists only published courses, featured first', async () => {
    const page = await list();
    expect(page.total).toBe(3);
    expect(slugs(page)[0]).toBe('programacion-avanzada');
    expect(slugs(page)).not.toContain('curso-borrador');
    expect(slugs(page)).not.toContain('curso-archivado');
  });

  it('filters by area and modality', async () => {
    expect(slugs(await list('?area=gestion'))).toEqual(['contabilidad-basica']);
    expect(slugs(await list('?area=tecnologia&modality=blended'))).toEqual([
      'seguridad-informatica',
    ]);
  });

  it('filters by start date using Punta Arenas calendar days', async () => {
    expect(slugs(await list('?from=2030-03-09&to=2030-03-09'))).toEqual(['programacion-avanzada']);
    expect(slugs(await list('?from=2030-03-10&to=2030-03-31'))).toEqual([]);
    expect(slugs(await list('?from=2030-04-01'))).toEqual(['contabilidad-basica']);
  });

  it('paginates with totals', async () => {
    const first = await list('?pageSize=2&page=1');
    const second = await list('?pageSize=2&page=2');
    expect(first).toMatchObject({ total: 3, totalPages: 2 });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...slugs(first), ...slugs(second)]).size).toBe(3);
    expect((await list('?pageSize=2&page=9')).items).toEqual([]);
  });
});

describe('course detail', () => {
  it('shows only published editions that have not ended, with instructors', async () => {
    const response = await app.inject('/api/catalog/courses/programacion-avanzada');
    expect(response.statusCode).toBe(200);
    const course = CourseDetailSchema.parse(response.json());
    expect(course.editions.map((edition) => edition.code)).toEqual(['PROG-1']);
    expect(course.instructors).toEqual([{ name: 'Camila Vidal', title: 'Ingeniera', bio: null }]);
    expect(course.objectives).toEqual(['Diseñar aplicaciones mantenibles']);
  });

  it('counts enrollments and active reservations against capacity', async () => {
    const course = CourseDetailSchema.parse(
      (await app.inject('/api/catalog/courses/seguridad-informatica')).json(),
    );
    // Capacidad 3 − 1 inscrito vigente (el retirado no cuenta) − 1 reserva activa = 1.
    expect(course.editions[0]).toMatchObject({ capacity: 3, availableSeats: 1 });

    const user = await prisma.user.create({ data: { email: 'eva@example.com', name: 'Eva' } });
    await prisma.enrollment.create({
      data: { userId: user.id, editionId: soldOutEditionId, source: 'purchase' },
    });
    const updated = CourseDetailSchema.parse(
      (await app.inject('/api/catalog/courses/seguridad-informatica')).json(),
    );
    expect(updated.editions[0]?.availableSeats).toBe(0);
    expect(updated.nextEdition?.availableSeats).toBe(0);
  });

  it('hides drafts and archived courses', async () => {
    expect((await app.inject('/api/catalog/courses/curso-borrador')).statusCode).toBe(404);
    expect((await app.inject('/api/catalog/courses/curso-archivado')).statusCode).toBe(404);
  });
});

describe('areas, sitemap and SEO head', () => {
  it('lists areas that have published courses with their counts', async () => {
    const areas = AreasResponseSchema.parse((await app.inject('/api/catalog/areas')).json());
    expect(areas.items).toEqual([
      { slug: 'gestion', name: 'Gestión', description: null, courseCount: 1 },
      { slug: 'tecnologia', name: 'Tecnología', description: null, courseCount: 2 },
    ]);
  });

  it('includes every published course in the sitemap and nothing else', async () => {
    const xml = (await app.inject('/api/seo/sitemap.xml')).body;
    expect(xml).toContain('/cursos/programacion-avanzada</loc>');
    expect(xml).toContain('/cursos/contabilidad-basica</loc>');
    expect(xml).not.toContain('curso-borrador');
    expect(xml).not.toContain('curso-archivado');
  });

  it('renders JSON-LD for a published course from the database', async () => {
    const response = await app.inject({
      url: '/api/seo/head',
      headers: { 'x-original-uri': '/cursos/programacion-avanzada' },
    });
    const json = /<script type="application\/ld\+json">(.*)<\/script>/.exec(response.body)?.[1];
    expect(JSON.parse(json ?? '{}')).toMatchObject({
      '@type': 'Course',
      name: 'Programación avanzada',
      offers: [{ price: 50_000, priceCurrency: 'CLP' }],
    });
  });
});
