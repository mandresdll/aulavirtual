import {
  AdminCourseDetailSchema,
  AdminEditionSchema,
  AuditListResponseSchema,
  CourseDetailSchema,
  CSRF_HEADER,
  type AdminCourseDetail,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { PrismaUserRepository } from '../../src/modules/auth/users.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/**
 * Panel de administración contra PostgreSQL real: CRUD, publicación, duplicado, auditoría en
 * `audit_logs` y efecto inmediato en el catálogo público (caché invalidada). Las sesiones y la
 * caché van en memoria para no depender de Redis (eso lo cubre `redis.integration.test.ts`).
 */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL });

let prisma: PrismaClient;
let app: FastifyInstance;
let editor: TestSession;
let admin: TestSession;
let startedAt: Date;

function send(
  session: TestSession,
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { cookie: session.cookie, [CSRF_HEADER]: session.csrfToken, origin: WEB_URL },
    ...(payload === undefined ? {} : { payload }),
  });
}

function get(session: TestSession, url: string) {
  return app.inject({ method: 'GET', url, headers: { cookie: session.cookie } });
}

const dates = {
  startsAt: daysFromNow(30).toISOString(),
  endsAt: daysFromNow(60).toISOString(),
  enrollmentOpensAt: daysFromNow(-1).toISOString(),
  enrollmentClosesAt: daysFromNow(25).toISOString(),
};
const editionInput = (code: string) => ({
  code,
  ...dates,
  capacity: 25,
  priceClp: 120_000,
  taxTreatment: 'exempt',
  schedule: 'Jueves 18:30',
  passingCriterion: 'completion',
});

beforeAll(async () => {
  startedAt = new Date();
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);
  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma,
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
  });
  editor = await loginAs(app, 'mock-editor');
  admin = await loginAs(app, 'mock-admin');
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('login creates the platform user', () => {
  it('stores only the minimum identity data and audits the login', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { idpSubject: 'mock-editor' } });
    expect(user).toMatchObject({
      email: 'editor.uta@example.com',
      name: 'Editora UTA',
      sgaUserId: 'sga-0002',
      rut: null,
      phone: null,
    });
    const login = await prisma.auditLog.findFirst({
      where: { action: 'auth.login', actorId: user.id },
    });
    expect(login).toMatchObject({ entityType: 'user', entityId: user.id });
  });

  it('refuses to link an email that belongs to another identity', async () => {
    const users = new PrismaUserRepository(prisma);
    await expect(
      users.upsertFromIdentity({
        subject: 'otra-identidad',
        sgaUserId: null,
        email: 'EDITOR.UTA@example.com',
        name: 'Suplantación',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CONFLICT' });
  });
});

describe('admin catalog management', () => {
  let areaId: string;
  let instructorId: string;
  let course: AdminCourseDetail;
  let editionId: string;

  it('creates an area and an instructor', async () => {
    const area = await send(editor, 'POST', '/api/admin/areas', {
      slug: 'idiomas',
      name: 'Idiomas',
      description: '',
    });
    expect(area.statusCode).toBe(201);
    expect(area.json()).toMatchObject({ slug: 'idiomas', description: null, courseCount: 0 });
    areaId = area.json().id;

    const duplicate = await send(editor, 'POST', '/api/admin/areas', {
      slug: 'idiomas',
      name: 'Otra',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.message).toContain('slug');

    const instructor = await send(editor, 'POST', '/api/admin/instructors', {
      name: 'Patricia Soto',
      title: 'Profesora de inglés',
    });
    expect(instructor.statusCode).toBe(201);
    instructorId = instructor.json().id;
  });

  it('creates a course as a draft that the public catalog does not show', async () => {
    const response = await send(editor, 'POST', '/api/admin/courses', {
      slug: 'ingles-para-el-turismo',
      title: 'Inglés para el turismo',
      summary: 'Atiende visitantes en inglés.',
      description: 'Curso práctico para servicios turísticos de Magallanes.',
      objectives: ['Saludar y orientar a visitantes'],
      contents: ['Vocabulario de servicios'],
      modality: 'online',
      durationHours: 30,
      areaId,
      instructorIds: [instructorId],
      featured: true,
    });
    expect(response.statusCode).toBe(201);
    course = AdminCourseDetailSchema.parse(response.json());
    expect(course).toMatchObject({ status: 'draft', instructorIds: [instructorId] });

    const pub = await app.inject('/api/catalog/courses/ingles-para-el-turismo');
    expect(pub.statusCode).toBe(404);
  });

  it('validates references and edition dates', async () => {
    const badArea = await send(editor, 'PUT', `/api/admin/courses/${course.id}`, {
      ...course,
      areaId: '00000000-0000-4000-8000-000000000000',
    });
    expect(badArea.statusCode).toBe(400);
    expect(badArea.json().error.code).toBe('INVALID_AREA');

    const badDates = await send(editor, 'POST', `/api/admin/courses/${course.id}/editions`, {
      ...editionInput('ING-2026-1'),
      endsAt: daysFromNow(10).toISOString(),
    });
    expect(badDates.statusCode).toBe(400);
  });

  it('publishes the course and an edition, and the catalog shows them at once', async () => {
    // El catálogo público queda en caché antes de publicar.
    expect((await app.inject('/api/catalog/courses/ingles-para-el-turismo')).statusCode).toBe(404);

    const created = await send(editor, 'POST', `/api/admin/courses/${course.id}/editions`, {
      ...editionInput('ING-2026-1'),
    });
    expect(created.statusCode).toBe(201);
    editionId = AdminEditionSchema.parse(created.json()).id;

    expect(
      (await send(editor, 'POST', `/api/admin/editions/${editionId}/publish`)).statusCode,
    ).toBe(200);
    const published = await send(editor, 'POST', `/api/admin/courses/${course.id}/publish`);
    expect(published.json()).toMatchObject({
      status: 'published',
      publishedAt: expect.any(String),
    });

    const pub = await app.inject('/api/catalog/courses/ingles-para-el-turismo');
    expect(pub.statusCode).toBe(200);
    const detail = CourseDetailSchema.parse(pub.json());
    expect(detail.editions).toHaveLength(1);
    expect(detail.editions[0]).toMatchObject({ code: 'ING-2026-1', priceClp: 120_000 });
    expect(detail.instructors).toEqual([
      { name: 'Patricia Soto', title: 'Profesora de inglés', bio: null },
    ]);

    const list = await app.inject('/api/catalog/courses?q=turismo');
    expect(list.json().total).toBe(1);
  });

  it('updates price and seats, audits only the changed fields and refreshes the catalog', async () => {
    const response = await send(editor, 'PUT', `/api/admin/editions/${editionId}`, {
      ...editionInput('ING-2026-1'),
      priceClp: 99_000,
      capacity: 40,
    });
    expect(response.statusCode).toBe(200);

    const pub = CourseDetailSchema.parse(
      (await app.inject('/api/catalog/courses/ingles-para-el-turismo')).json(),
    );
    expect(pub.editions[0]).toMatchObject({ priceClp: 99_000, capacity: 40 });

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'edition.update', entityId: editionId },
      orderBy: { id: 'desc' },
    });
    expect(entry).toMatchObject({
      actorRole: 'uta_editor',
      before: { priceClp: 120_000, capacity: 25 },
      after: { priceClp: 99_000, capacity: 40 },
    });
    expect(Object.keys(entry?.before as object).sort()).toEqual(['capacity', 'priceClp']);
  });

  it('renaming the area or the instructor refreshes the course page', async () => {
    await send(editor, 'PUT', `/api/admin/instructors/${instructorId}`, {
      name: 'Patricia Soto Vera',
      title: 'Profesora de inglés',
    });
    const pub = CourseDetailSchema.parse(
      (await app.inject('/api/catalog/courses/ingles-para-el-turismo')).json(),
    );
    expect(pub.instructors[0]?.name).toBe('Patricia Soto Vera');
  });

  it('duplicates an edition as an unpublished draft with a new code', async () => {
    const response = await send(editor, 'POST', `/api/admin/editions/${editionId}/duplicate`, {
      code: 'ING-2026-2',
    });
    expect(response.statusCode).toBe(201);
    const copy = AdminEditionSchema.parse(response.json());
    expect(copy).toMatchObject({
      code: 'ING-2026-2',
      status: 'draft',
      priceClp: 99_000,
      capacity: 40,
      schedule: 'Jueves 18:30',
      enrollmentCount: 0,
    });

    const sameCode = await send(editor, 'POST', `/api/admin/editions/${editionId}/duplicate`, {
      code: 'ING-2026-2',
    });
    expect(sameCode.statusCode).toBe(409);

    // El borrador no aparece en el catálogo y se puede eliminar.
    const pub = CourseDetailSchema.parse(
      (await app.inject('/api/catalog/courses/ingles-para-el-turismo')).json(),
    );
    expect(pub.editions.map((edition) => edition.code)).toEqual(['ING-2026-1']);
    expect((await send(editor, 'DELETE', `/api/admin/editions/${copy.id}`)).statusCode).toBe(204);
  });

  it('does not delete a published edition, nor an area or instructor in use', async () => {
    const edition = await send(editor, 'DELETE', `/api/admin/editions/${editionId}`);
    expect(edition.statusCode).toBe(409);
    const area = await send(editor, 'DELETE', `/api/admin/areas/${areaId}`);
    expect(area.statusCode).toBe(409);
    expect(area.json().error.message).toContain('tiene cursos');
    const instructor = await send(editor, 'DELETE', `/api/admin/instructors/${instructorId}`);
    expect(instructor.statusCode).toBe(409);
  });

  it('lists courses with search and status filters, and returns the full course', async () => {
    const list = await get(editor, '/api/admin/courses?q=INGLES&status=published');
    expect(list.json()).toMatchObject({ total: 1, items: [{ slug: 'ingles-para-el-turismo' }] });
    const none = await get(editor, '/api/admin/courses?q=ingles&status=archived');
    expect(none.json().total).toBe(0);

    const detail = AdminCourseDetailSchema.parse(
      (await get(editor, `/api/admin/courses/${course.id}`)).json(),
    );
    expect(detail.editions.map((edition) => edition.code)).toEqual(['ING-2026-1']);
  });

  it('archives the course instead of deleting it and hides it from the catalog', async () => {
    const archived = await send(editor, 'POST', `/api/admin/courses/${course.id}/archive`);
    expect(archived.json().status).toBe('archived');
    expect((await app.inject('/api/catalog/courses/ingles-para-el-turismo')).statusCode).toBe(404);
    expect(await prisma.course.count({ where: { id: course.id } })).toBe(1);

    const unpublished = await send(editor, 'POST', `/api/admin/courses/${course.id}/unpublish`);
    expect(unpublished.json().status).toBe('draft');
  });

  it('deletes an unused area', async () => {
    const area = await send(editor, 'POST', '/api/admin/areas', {
      slug: 'temporal',
      name: 'Temporal',
    });
    expect((await send(editor, 'DELETE', `/api/admin/areas/${area.json().id}`)).statusCode).toBe(
      204,
    );
    expect(await prisma.area.count({ where: { slug: 'temporal' } })).toBe(0);
  });
});

describe('audit view', () => {
  it('is read-only and only for administrators', async () => {
    expect((await get(editor, '/api/admin/audit')).statusCode).toBe(403);
    const post = await send(admin, 'POST', '/api/admin/audit', {});
    expect(post.statusCode).toBe(404);
  });

  it('filters by action, entity and local dates, with the actor name', async () => {
    // La auditoría es append-only y persiste entre ejecuciones: se filtra por el curso de esta.
    const course = await prisma.course.findUniqueOrThrow({
      where: { slug: 'ingles-para-el-turismo' },
    });
    const response = await get(
      admin,
      `/api/admin/audit?entityType=course&action=course.publish&entityId=${course.id}`,
    );
    const page = AuditListResponseSchema.parse(response.json());
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      action: 'course.publish',
      actorName: 'Editora UTA',
      actorRole: 'uta_editor',
      before: { status: 'draft' },
      after: { status: 'published' },
    });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Punta_Arenas' }).format(
      startedAt,
    );
    const todays = AuditListResponseSchema.parse(
      (await get(admin, `/api/admin/audit?from=${today}&to=${today}&pageSize=100`)).json(),
    );
    expect(todays.items.map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'area.create',
        'course.create',
        'edition.duplicate',
        'edition.delete',
      ]),
    );
    expect(
      todays.items.every((item) => Date.parse(item.createdAt) >= startedAt.getTime() - 86_400_000),
    ).toBe(true);
    const past = AuditListResponseSchema.parse(
      (await get(admin, '/api/admin/audit?to=2020-01-01')).json(),
    );
    expect(past.total).toBe(0);
  });

  it('keeps the entries even if someone tries to change them in the database', async () => {
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow();
  });
});
