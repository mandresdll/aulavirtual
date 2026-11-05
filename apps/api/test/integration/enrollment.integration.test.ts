import { randomUUID } from 'node:crypto';
import {
  AdminEnrollmentsResponseSchema,
  CSRF_HEADER,
  MyEnrollmentsSchema,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { IntegrationError } from '../../src/integrations/errors.js';
import { createIntegrations, type Integrations } from '../../src/integrations/index.js';
import type { MemoryMailer } from '../../src/integrations/mailer/memory.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { CheckoutService } from '../../src/modules/checkout/checkout.service.js';
import { createEnrollment } from '../../src/modules/enrollment/enrollment-records.js';
import {
  EnrollmentConfigError,
  EnrollmentService,
} from '../../src/modules/enrollment/enrollment.service.js';
import { WaitlistService } from '../../src/modules/enrollment/waitlist.service.js';
import { LegalService } from '../../src/modules/legal/legal.service.js';
import { PrismaAuditRecorder } from '../../src/plugins/audit.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/**
 * Matrícula, inscripción liberada y lista de espera contra PostgreSQL real, con el Aula Virtual
 * simulada (RF-04, RF-05). Sin BullMQ: los procesadores se prueban aparte.
 */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL, CHECKOUT_RATE_LIMIT_MAX: '1000' });
const run = randomUUID().slice(0, 8);
const logger = { error: () => {}, warn: () => {} };
const actor = { actorId: null, actorRole: null };

let prisma: PrismaClient;
let app: FastifyInstance;
let integrations: Integrations;
let enrollment: EnrollmentService;
let waitlist: WaitlistService;
let checkout: CheckoutService;
let student: TestSession;
let admin: TestSession;
let courseId: string;
let count = 0;

function send(
  session: TestSession,
  method: 'POST' | 'DELETE',
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

async function newEdition(extra: Record<string, unknown> = {}) {
  count += 1;
  const edition = await prisma.courseEdition.create({
    data: {
      courseId,
      code: `MAT-${run}-${count}`.toUpperCase(),
      startsAt: daysFromNow(30),
      endsAt: daysFromNow(60),
      enrollmentClosesAt: daysFromNow(20),
      capacity: 5,
      priceClp: 30_000,
      status: 'published',
      moodleCourseId: '42',
      ...extra,
    },
  });
  return edition.id;
}

async function newUser() {
  count += 1;
  const user = await prisma.user.create({
    data: { email: `mat-${run}-${count}@example.com`, name: `María José Soto ${count}` },
  });
  return user.id;
}

async function enroll(editionId: string, userId?: string) {
  const id = userId ?? (await newUser());
  await prisma.$transaction((tx) =>
    createEnrollment(tx, { userId: id, editionId, source: 'manual_admin' }),
  );
  return prisma.enrollment.findUniqueOrThrow({
    where: { userId_editionId: { userId: id, editionId } },
  });
}

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);
  const area = await prisma.area.create({ data: { slug: `mat-${run}`, name: 'Matrícula' } });
  const course = await prisma.course.create({
    data: {
      slug: `mat-${run}`,
      title: 'Curso de matrícula',
      summary: 'Resumen',
      description: 'Descripción',
      modality: 'online',
      durationHours: 10,
      areaId: area.id,
      status: 'published',
    },
  });
  courseId = course.id;

  integrations = createIntegrations(env);
  const audit = new PrismaAuditRecorder(prisma);
  const cache = new MemoryCache();
  checkout = new CheckoutService({
    prisma,
    audit,
    legal: new LegalService(prisma, audit),
    cache,
    reservationTtlMinutes: 15,
  });
  const common = {
    prisma,
    mailer: integrations.mailer,
    audit,
    checkout,
    logger,
    webUrl: WEB_URL,
  };
  enrollment = new EnrollmentService({
    ...common,
    lms: integrations.lms,
    cache,
    alertEmail: 'uta@example.cl',
    lmsUrl: 'https://aula.example.cl',
  });
  waitlist = new WaitlistService({ ...common, offerHours: 24 });

  app = await buildApp({
    env,
    integrations,
    readinessChecks: {},
    prisma,
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
  });
  student = await loginAs(app, 'mock-student');
  admin = await loginAs(app, 'mock-admin');
});

afterAll(async () => {
  await prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });
  await app.close();
  await prisma.$disconnect();
});

describe('LMS enrollment', () => {
  it('creates the LMS user, enrolls once and welcomes once', async () => {
    const editionId = await newEdition();
    const pending = await enroll(editionId);
    expect(await enrollment.pendingIds()).toContain(pending.id);

    await enrollment.process(pending.id);
    await enrollment.process(pending.id);
    const done = await prisma.enrollment.findUniqueOrThrow({
      where: { id: pending.id },
      include: { user: true },
    });
    expect(done).toMatchObject({ status: 'enrolled', lmsSyncAttempts: 1, lastLmsError: null });
    expect(done.enrolledAt).not.toBeNull();
    expect(
      await integrations.lms.isEnrolled({
        userId: Number(done.user.moodleUserId),
        courseId: 42,
      }),
    ).toBe(true);
    const lmsUser = await integrations.lms.findUserByEmail(done.user.email);
    expect(lmsUser).toMatchObject({
      firstName: 'María',
      lastName: expect.stringContaining('José'),
    });

    const mailer = integrations.mailer as MemoryMailer;
    expect(await enrollment.sendWelcomes()).toBeGreaterThanOrEqual(1);
    const welcome = mailer.sent.find((mail) => mail.to === done.user.email);
    expect(welcome?.text).toContain('https://aula.example.cl');
    expect(await enrollment.sendWelcomes()).toBe(0);
  });

  it('reuses a user that already exists in the LMS', async () => {
    const editionId = await newEdition();
    const pending = await enroll(editionId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });
    const existing = await integrations.lms.createUser({
      username: 'ya.existe',
      email: user.email,
      firstName: 'Ya',
      lastName: 'Existe',
    });
    await enrollment.process(pending.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).moodleUserId).toBe(
      String(existing.id),
    );
  });

  it('shows a failed enrollment in the panel, alerts and retries it', async () => {
    const editionId = await newEdition({ moodleCourseId: null });
    const pending = await enroll(editionId);
    await expect(enrollment.process(pending.id)).rejects.toBeInstanceOf(EnrollmentConfigError);
    await enrollment.markFailed(pending.id, 'La edición no tiene un curso del Aula Virtual');

    const mailer = integrations.mailer as MemoryMailer;
    expect(mailer.sent.some((mail) => mail.to === 'uta@example.cl')).toBe(true);

    const list = await app.inject({
      url: '/api/admin/enrollments',
      headers: { cookie: admin.cookie },
    });
    const item = AdminEnrollmentsResponseSchema.parse(list.json()).items.find(
      (entry) => entry.id === pending.id,
    );
    expect(item).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'La edición no tiene un curso del Aula Virtual',
    });

    await prisma.courseEdition.update({ where: { id: editionId }, data: { moodleCourseId: '42' } });
    const retry = await send(admin, 'POST', `/api/admin/enrollments/${pending.id}/retry`);
    expect(retry.statusCode).toBe(204);
    await enrollment.process(pending.id);
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
      'enrolled',
    );
    const again = await send(admin, 'POST', `/api/admin/enrollments/${pending.id}/retry`);
    expect(again.statusCode).toBe(409);
  });

  it('keeps the attempt and error of a temporary failure', async () => {
    const editionId = await newEdition();
    const pending = await enroll(editionId);
    const spy = vi
      .spyOn(integrations.lms, 'findUserByEmail')
      .mockRejectedValueOnce(new IntegrationError('lms', 'DOWN', 'Moodle caído', true));
    await expect(enrollment.process(pending.id)).rejects.toBeInstanceOf(IntegrationError);
    await enrollment.recordAttempt(pending.id, 'Moodle caído');
    spy.mockRestore();
    expect(await prisma.enrollment.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: 'pending_lms',
      lmsSyncAttempts: 1,
      lastLmsError: 'Moodle caído',
    });
  });

  it('unenrolls withdrawn students and lets them enroll again', async () => {
    const editionId = await newEdition();
    const pending = await enroll(editionId);
    await enrollment.process(pending.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });
    await prisma.enrollment.update({
      where: { id: pending.id },
      data: { status: 'withdrawn', withdrawnAt: new Date() },
    });

    expect(await enrollment.syncWithdrawals()).toBeGreaterThanOrEqual(1);
    const lmsId = { userId: Number(user.moodleUserId), courseId: 42 };
    expect(await integrations.lms.isEnrolled(lmsId)).toBe(false);
    expect(await enrollment.syncWithdrawals()).toBe(0);

    // Volver a comprar la misma edición reactiva la fila (índice único usuario + edición).
    const again = await enroll(editionId, pending.userId);
    expect(again).toMatchObject({
      id: pending.id,
      status: 'pending_lms',
      enrolledAt: null,
      lmsUnenrolledAt: null,
      welcomeSentAt: null,
    });
  });
});

describe('free community enrollment', () => {
  const free = { freeForCommunity: true, communityProfiles: ['student'] };

  it('enrolls an eligible student without an order', async () => {
    const editionId = await newEdition(free);
    const response = await send(student, 'POST', '/api/enrollments/free', { editionId });
    expect(response.statusCode).toBe(204);

    const mine = MyEnrollmentsSchema.parse(
      (
        await app.inject({ url: '/api/my/enrollments', headers: { cookie: student.cookie } })
      ).json(),
    );
    expect(mine.enrolledEditionIds).toContain(editionId);
    const stored = await prisma.enrollment.findFirstOrThrow({ where: { editionId } });
    expect(stored).toMatchObject({
      source: 'free_institutional',
      status: 'pending_lms',
      orderItemId: null,
    });
    const again = await send(student, 'POST', '/api/enrollments/free', { editionId });
    expect(again.statusCode).toBe(409);
  });

  it('rejects other profiles and editions that are not free', async () => {
    const onlyTeachers = await newEdition({
      freeForCommunity: true,
      communityProfiles: ['teacher'],
    });
    expect(
      (await send(student, 'POST', '/api/enrollments/free', { editionId: onlyTeachers }))
        .statusCode,
    ).toBe(403);
    const paid = await newEdition();
    expect(
      (await send(student, 'POST', '/api/enrollments/free', { editionId: paid })).statusCode,
    ).toBe(403);
  });

  it('never exceeds the seats with simultaneous requests', async () => {
    const editionId = await newEdition({ ...free, capacity: 2 });
    const users = await Promise.all(Array.from({ length: 6 }, () => newUser()));
    const results = await Promise.allSettled(
      users.map((id) => enrollment.enrollFree({ id, profiles: ['student'] }, editionId, actor)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(await prisma.enrollment.count({ where: { editionId } })).toBe(2);
  });
});

describe('waitlist', () => {
  async function soldOut() {
    const editionId = await newEdition({ capacity: 1 });
    const seat = await enroll(editionId);
    return { editionId, seat };
  }
  const entry = (editionId: string, userId: string) =>
    prisma.waitlistEntry.findUniqueOrThrow({
      where: { editionId_userId: { editionId, userId } },
    });

  it('only accepts people when there are no seats', async () => {
    const editionId = await newEdition();
    const open = await send(student, 'POST', '/api/waitlist', { editionId });
    expect(open.statusCode).toBe(409);
    expect(open.json().error.code).toBe('WAITLIST_NOT_NEEDED');

    const full = await soldOut();
    const joined = await send(student, 'POST', '/api/waitlist', { editionId: full.editionId });
    expect(joined.statusCode).toBe(204);
    const mine = MyEnrollmentsSchema.parse(
      (
        await app.inject({ url: '/api/my/enrollments', headers: { cookie: student.cookie } })
      ).json(),
    );
    expect(mine.waitlist).toContainEqual({
      editionId: full.editionId,
      position: 1,
      offerExpiresAt: null,
    });
    await send(student, 'DELETE', `/api/waitlist/${full.editionId}`);
  });

  it('holds a freed seat for the next person, who can buy it', async () => {
    const { editionId, seat } = await soldOut();
    const [first, second] = [await newUser(), await newUser()];
    await waitlist.join(first, editionId, actor);
    await waitlist.join(second, editionId, actor);
    await waitlist.advance();
    expect((await entry(editionId, first)).status).toBe('waiting');

    // Se libera el cupo: por devolución, retiro, aumento de cupos u orden vencida.
    await prisma.enrollment.update({ where: { id: seat.id }, data: { status: 'withdrawn' } });
    expect(await waitlist.advance()).toBeGreaterThanOrEqual(1);
    const offered = await entry(editionId, first);
    expect(offered.status).toBe('notified');
    expect((await entry(editionId, second)).status).toBe('waiting');

    const mailer = integrations.mailer as MemoryMailer;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: first } });
    expect(await waitlist.sendOffers()).toBeGreaterThanOrEqual(1);
    expect(mailer.sent.some((mail) => mail.to === user.email)).toBe(true);
    expect(await waitlist.sendOffers()).toBe(0);

    // El cupo retenido no está disponible para otros, pero sí para quien tiene la oferta.
    const reasonFor = async (id: string) =>
      (await checkout.availability(prisma, [editionId], id))[0]?.reason;
    expect(await reasonFor(second)).toContain('no tiene cupos');
    expect(await reasonFor(first)).toBeNull();

    await prisma.courseEdition.update({
      where: { id: editionId },
      data: { freeForCommunity: true, communityProfiles: ['student'] },
    });
    await enrollment.enrollFree({ id: first, profiles: ['student'] }, editionId, actor);
    expect((await entry(editionId, first)).status).toBe('converted');
    expect(await prisma.seatReservation.count({ where: { editionId, status: 'active' } })).toBe(0);
  });

  it('passes the offer to the next person when it expires', async () => {
    const { editionId, seat } = await soldOut();
    const [first, second] = [await newUser(), await newUser()];
    await waitlist.join(first, editionId, actor);
    await waitlist.join(second, editionId, actor);
    await prisma.enrollment.update({ where: { id: seat.id }, data: { status: 'withdrawn' } });
    await waitlist.advance();

    const audit = new PrismaAuditRecorder(prisma);
    const later = new WaitlistService({
      prisma,
      mailer: integrations.mailer,
      audit,
      checkout,
      logger,
      webUrl: WEB_URL,
      offerHours: 24,
      now: () => new Date(Date.now() + 25 * 3_600_000),
    });
    await later.advance();
    expect((await entry(editionId, first)).status).toBe('expired');
    expect((await entry(editionId, second)).status).toBe('notified');
  });

  it('frees the held seat when the person leaves the list', async () => {
    const { editionId, seat } = await soldOut();
    const first = await newUser();
    await waitlist.join(first, editionId, actor);
    await prisma.enrollment.update({ where: { id: seat.id }, data: { status: 'withdrawn' } });
    await waitlist.advance();
    await waitlist.leave(first, editionId, actor);
    expect((await entry(editionId, first)).status).toBe('cancelled');
    expect(await prisma.seatReservation.count({ where: { editionId, status: 'active' } })).toBe(0);
  });

  it('does not offer seats after enrollment closes', async () => {
    const { editionId, seat } = await soldOut();
    const first = await newUser();
    await waitlist.join(first, editionId, actor);
    await prisma.enrollment.update({ where: { id: seat.id }, data: { status: 'withdrawn' } });
    await prisma.courseEdition.update({
      where: { id: editionId },
      data: { enrollmentClosesAt: daysFromNow(-1) },
    });
    await waitlist.advance();
    expect((await entry(editionId, first)).status).toBe('waiting');
  });
});
