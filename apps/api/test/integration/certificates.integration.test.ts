import { randomUUID } from 'node:crypto';
import {
  AdminCertificatesResponseSchema,
  CSRF_HEADER,
  MyCoursesSchema,
  VerificationSchema,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import type { CertificateValidator } from '../../src/integrations/certificate-validator/port.js';
import { IntegrationError } from '../../src/integrations/errors.js';
import { createIntegrations, type Integrations } from '../../src/integrations/index.js';
import type { CourseCompletion, LmsGateway } from '../../src/integrations/lms/port.js';
import type { MemoryMailer } from '../../src/integrations/mailer/memory.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { CertificatesService } from '../../src/modules/certificates/certificates.service.js';
import { PrismaAuditRecorder } from '../../src/plugins/audit.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/** Aprobación, certificados y validador contra PostgreSQL real (RF-06). */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL, VERIFY_RATE_LIMIT_MAX: '1000' });
const run = randomUUID().slice(0, 8);
const actor = { actorId: null, actorRole: null };
const provider = {
  name: 'CFT Estatal de Magallanes',
  rut: '61.980.520-8',
  address: 'Punta Arenas',
  email: 'uta@example.cl',
  phone: '+56 61 000 0000',
};

const validator = {
  provider: 'stub',
  register: vi.fn<CertificateValidator['register']>(),
  revoke: vi.fn<CertificateValidator['revoke']>(),
};

/** Aula Virtual mínima: solo lo que se consulta aquí. */
const completions = new Map<number, CourseCompletion>();
const lms = {
  setCompletion: (userId: number, _courseId: number, completion: CourseCompletion) =>
    completions.set(userId, completion),
  getCourseCompletion: async ({ userId }: { userId: number }): Promise<CourseCompletion> =>
    completions.get(userId) ?? { completed: false, grade: null },
};

let prisma: PrismaClient;
let app: FastifyInstance;
let integrations: Integrations;
let certificates: CertificatesService;
let student: TestSession;
let admin: TestSession;
let courseId: string;
let count = 0;

function post(url: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url,
    headers: { cookie: admin.cookie, [CSRF_HEADER]: admin.csrfToken, origin: WEB_URL },
    ...(payload === undefined ? {} : { payload }),
  });
}

async function newEdition(extra: Record<string, unknown> = {}) {
  count += 1;
  const edition = await prisma.courseEdition.create({
    data: {
      courseId,
      code: `CER-${run}-${count}`.toUpperCase(),
      startsAt: daysFromNow(-20),
      endsAt: daysFromNow(-1),
      enrollmentClosesAt: daysFromNow(-21),
      capacity: 5,
      priceClp: 0,
      status: 'published',
      moodleCourseId: '77',
      ...extra,
    },
  });
  return edition.id;
}

/** Inscripción matriculada de una persona nueva, con su usuario en el Aula Virtual. */
async function enrolled(editionId: string, userId?: string) {
  count += 1;
  const moodleUserId = 500_000 + count;
  const id =
    userId ??
    (
      await prisma.user.create({
        data: {
          email: `cer-${run}-${count}@example.com`,
          name: `Ana Soto ${count}`,
          moodleUserId: String(moodleUserId),
        },
      })
    ).id;
  const row = await prisma.enrollment.create({
    data: { userId: id, editionId, source: 'manual_admin', status: 'enrolled' },
  });
  return { id: row.id, moodleUserId };
}

async function approvedCertificate(userId?: string) {
  const editionId = await newEdition();
  const enrollment = await enrolled(editionId, userId);
  const user = await prisma.user.findFirstOrThrow({
    where: { enrollments: { some: { id: enrollment.id } } },
  });
  lms.setCompletion(Number(user.moodleUserId), 77, { completed: true, grade: null });
  await certificates.syncResults(editionId);
  return prisma.certificate.findFirstOrThrow({ where: { enrollmentId: enrollment.id } });
}

const verify = async (code: string) =>
  VerificationSchema.parse(
    (await app.inject({ method: 'GET', url: `/api/verify/${code}` })).json(),
  );

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);
  const area = await prisma.area.create({ data: { slug: `cer-${run}`, name: 'Certificados' } });
  const course = await prisma.course.create({
    data: {
      slug: `cer-${run}`,
      title: 'Curso certificado',
      summary: 'Resumen',
      description: 'Descripción',
      modality: 'online',
      durationHours: 20,
      areaId: area.id,
      status: 'published',
    },
  });
  courseId = course.id;

  integrations = createIntegrations(env);
  certificates = new CertificatesService({
    prisma,
    lms: lms as unknown as LmsGateway,
    validator,
    mailer: integrations.mailer,
    audit: new PrismaAuditRecorder(prisma),
    logger: { error: () => {}, warn: () => {} },
    provider,
    webUrl: WEB_URL,
    graceDays: 30,
  });
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

describe('course results', () => {
  it('approves once, issues one certificate and emails it once', async () => {
    const editionId = await newEdition();
    const { id, moodleUserId } = await enrolled(editionId);
    lms.setCompletion(moodleUserId, 77, { completed: true, grade: null });

    expect(await certificates.syncResults(editionId)).toEqual({
      checked: 1,
      completed: 1,
      failed: 0,
    });
    expect(await certificates.syncResults(editionId)).toMatchObject({ checked: 0 });

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id },
      include: { certificates: true },
    });
    expect(enrollment.status).toBe('completed');
    expect(enrollment.completedAt).not.toBeNull();
    expect(enrollment.certificates).toHaveLength(1);
    expect(enrollment.certificates[0]?.pdfSha256).toMatch(/^[0-9a-f]{64}$/);

    const mailer = integrations.mailer as MemoryMailer;
    const before = mailer.sent.length;
    await certificates.sendPending();
    await certificates.sendPending();
    const mails = mailer.sent.slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.attachments?.[0]?.contentType).toBe('application/pdf');
  });

  it('fails a graded course only after the grace period', async () => {
    const recent = await newEdition({ passingCriterion: 'grade', passingGrade: 4 });
    const first = await enrolled(recent);
    lms.setCompletion(first.moodleUserId, 77, { completed: true, grade: 3 });
    await certificates.syncResults(recent);
    expect(await prisma.enrollment.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      status: 'enrolled',
    });

    const old = await newEdition({
      passingCriterion: 'grade',
      passingGrade: 4,
      startsAt: daysFromNow(-90),
      endsAt: daysFromNow(-60),
    });
    const second = await enrolled(old);
    lms.setCompletion(second.moodleUserId, 77, { completed: true, grade: 3 });
    expect(await certificates.syncResults(old)).toMatchObject({ failed: 1 });
    expect(await prisma.certificate.count({ where: { enrollmentId: second.id } })).toBe(0);
  });

  it('leaves a graded course without grade to a manual decision', async () => {
    const editionId = await newEdition({
      passingCriterion: 'grade',
      passingGrade: 4,
      startsAt: daysFromNow(-90),
      endsAt: daysFromNow(-60),
    });
    const { id, moodleUserId } = await enrolled(editionId);
    lms.setCompletion(moodleUserId, 77, { completed: false, grade: null });
    await certificates.syncResults(editionId);
    expect((await certificates.needsReview()).map((item) => item.id)).toContain(id);

    expect(
      (await post(`/api/admin/enrollments/${id}/result`, { result: 'completed' })).statusCode,
    ).toBe(204);
    expect(await prisma.certificate.count({ where: { enrollmentId: id } })).toBe(1);
    expect((await certificates.needsReview()).map((item) => item.id)).not.toContain(id);
    expect(
      (await post(`/api/admin/enrollments/${id}/result`, { result: 'completed' })).statusCode,
    ).toBe(409);
  });

  it('keeps going when the LMS fails for one enrollment', async () => {
    const editionId = await newEdition();
    const first = await enrolled(editionId);
    const second = await enrolled(editionId);
    lms.setCompletion(first.moodleUserId, 77, { completed: true, grade: null });
    lms.setCompletion(second.moodleUserId, 77, { completed: true, grade: null });
    const spy = vi.spyOn(lms, 'getCourseCompletion');
    spy.mockRejectedValueOnce(new Error('caído'));
    const summary = await certificates.syncResults(editionId);
    spy.mockRestore();
    expect(summary).toMatchObject({ checked: 2, completed: 1 });
  });
});

describe('verification', () => {
  it('shows only what is needed, with any spelling of the code', async () => {
    const certificate = await approvedCertificate();
    const result = await verify(certificate.code.toLowerCase().replaceAll('-', ''));
    expect(result).toEqual({
      status: 'valid',
      code: certificate.code,
      holderName: certificate.recipientName,
      courseTitle: 'Curso certificado',
      hours: 20,
      issuedAt: certificate.issuedAt.toISOString(),
    });
    expect(await verify('ZZZZ-ZZZZ-ZZZZ')).toEqual({ status: 'not_found' });
    expect(await verify('no-es-un-codigo')).toEqual({ status: 'not_found' });
  });
});

describe('reissue and revocation', () => {
  it('reissues with a new code linked to the previous one', async () => {
    const certificate = await approvedCertificate();
    const response = await post(`/api/admin/certificates/${certificate.id}/reissue`, {
      recipientName: 'Ana María Soto',
    });
    expect(response.statusCode).toBe(200);
    const created = response.json<{ code: string; recipientName: string }>();
    expect(created.recipientName).toBe('Ana María Soto');
    expect(created.code).not.toBe(certificate.code);
    expect(await verify(certificate.code)).toEqual({
      status: 'reissued',
      code: certificate.code,
      replacedBy: created.code,
    });
    expect(await verify(created.code)).toMatchObject({
      status: 'valid',
      holderName: 'Ana María Soto',
    });
    expect(
      (
        await post(`/api/admin/certificates/${certificate.id}/reissue`, {
          recipientName: 'Otra Persona',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('revokes with a reason and audits it', async () => {
    const certificate = await approvedCertificate();
    const response = await post(`/api/admin/certificates/${certificate.id}/revoke`, {
      reason: 'Error en la nómina',
    });
    expect(response.statusCode).toBe(200);
    expect(await verify(certificate.code)).toMatchObject({ status: 'revoked' });
    expect(
      await prisma.auditLog.count({
        where: { action: 'certificate.revoke', entityId: certificate.id },
      }),
    ).toBe(1);
  });
});

describe('owner access', () => {
  it('lists the course and serves the PDF only to its owner', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { idpSubject: 'mock-student' } });
    await prisma.user.update({
      where: { id: user.id },
      data: { moodleUserId: String(900_000 + Math.floor(Math.random() * 90_000)) },
    });
    const certificate = await approvedCertificate(user.id);

    const courses = await app.inject({
      method: 'GET',
      url: '/api/my/courses',
      headers: { cookie: student.cookie },
    });
    expect(
      MyCoursesSchema.parse(courses.json()).items.find(
        (item) => item.certificateCode === certificate.code,
      ),
    ).toMatchObject({ status: 'completed' });

    const url = `/api/my/certificates/${certificate.code}/pdf`;
    const own = await app.inject({ method: 'GET', url, headers: { cookie: student.cookie } });
    expect(own.statusCode).toBe(200);
    expect(own.headers['content-type']).toContain('application/pdf');
    expect(own.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const other = await app.inject({ method: 'GET', url, headers: { cookie: admin.cookie } });
    expect(other.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });

  it('finds certificates for the panel by code', async () => {
    const certificate = await approvedCertificate();
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/certificates?q=${certificate.code}`,
      headers: { cookie: admin.cookie },
    });
    expect(AdminCertificatesResponseSchema.parse(response.json()).items[0]?.id).toBe(
      certificate.id,
    );
  });
});

describe('validator sync', () => {
  it('keeps the certificate valid while the SGA is down and retries', async () => {
    const certificate = await approvedCertificate();
    validator.register.mockRejectedValue(
      new IntegrationError('certificate-validator', 'UNAVAILABLE', 'SGA caído', true),
    );
    await certificates.syncValidator();
    expect(
      await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } }),
    ).toMatchObject({ validatorSyncStatus: 'pending', validatorLastError: 'SGA caído' });
    expect(await verify(certificate.code)).toMatchObject({ status: 'valid' });

    validator.register.mockReset();
    validator.register.mockResolvedValue({ externalId: 'x' });
    await certificates.syncValidator();
    expect(
      await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } }),
    ).toMatchObject({ validatorSyncStatus: 'synced', validatorLastError: null });
  });

  it('stops retrying on a definitive rejection', async () => {
    const certificate = await approvedCertificate();
    validator.register.mockReset();
    validator.register.mockRejectedValue(
      new IntegrationError('certificate-validator', 'HTTP_422', 'Rechazado', false),
    );
    await certificates.syncValidator();
    expect(
      await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } }),
    ).toMatchObject({ validatorSyncStatus: 'failed' });
  });

  it('revokes in the validator only what was published', async () => {
    validator.register.mockReset();
    validator.register.mockResolvedValue({ externalId: 'x' });
    validator.revoke.mockReset();
    validator.revoke.mockResolvedValue();

    const published = await approvedCertificate();
    await certificates.syncValidator();
    const unpublished = await approvedCertificate();
    await certificates.revoke(published.id, 'Motivo de prueba', actor);
    await certificates.revoke(unpublished.id, 'Motivo de prueba', actor);
    await certificates.syncValidator();

    expect(validator.revoke).toHaveBeenCalledWith({
      code: published.code,
      reason: 'Motivo de prueba',
    });
    expect(validator.revoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: unpublished.code }),
    );
  });
});
