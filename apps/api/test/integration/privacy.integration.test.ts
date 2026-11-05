import { randomUUID } from 'node:crypto';
import { CSRF_HEADER, DataSubjectSummarySchema, LEAD_CONSENT } from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { LeadsService } from '../../src/modules/diffusion/leads.service.js';
import { ANONYMIZED_NAME } from '../../src/modules/privacy/privacy.service.js';
import { PrismaAuditRecorder } from '../../src/plugins/audit.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { daysFromNow, integrationEnv, resetCatalogData } from './helpers.js';

/** Acceso y supresión de datos de un titular contra PostgreSQL real (Ley 21.719). */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL });
const run = randomUUID().slice(0, 8);

let prisma: PrismaClient;
let app: FastifyInstance;
let admin: TestSession;
let finance: TestSession;
let courseId: string;
let count = 0;

const post = (path: string, email: string, session = admin) =>
  app.inject({
    method: 'POST',
    url: `/api/admin/data-subjects/${path}`,
    headers: { cookie: session.cookie, [CSRF_HEADER]: session.csrfToken, origin: WEB_URL },
    payload: { email },
  });

const newLead = (email: string) =>
  prisma.lead.create({
    data: {
      email,
      consentText: LEAD_CONSENT.text,
      consentVersion: LEAD_CONSENT.version,
      consentedAt: new Date(),
      unsubscribeToken: randomUUID().replaceAll('-', '').repeat(2),
    },
  });

/** Comprador con una orden pagada y su inscripción en el estado indicado. */
async function buyer(status: 'completed' | 'enrolled') {
  count += 1;
  const email = `titular-${run}-${count}@example.cl`;
  const user = await prisma.user.create({
    data: { email, name: 'Ana Soto', rut: `${count}-${run}`.slice(0, 12), phone: '+56911111111' },
  });
  const edition = await prisma.courseEdition.create({
    data: {
      courseId,
      code: `PRV-${run}-${count}`.toUpperCase(),
      startsAt: daysFromNow(-60),
      endsAt: daysFromNow(-30),
      enrollmentClosesAt: daysFromNow(-70),
      capacity: 10,
      priceClp: 1000,
      status: 'published',
    },
  });
  const order = await prisma.order.create({
    data: {
      number: `PRV-${run}-${count}`,
      userId: user.id,
      status: 'paid',
      subtotalClp: 1000,
      totalClp: 1000,
      legalAcceptedIp: '200.1.2.3',
      paidAt: new Date(),
      items: {
        create: {
          editionId: edition.id,
          courseTitle: 'Excel',
          unitPriceClp: 1000,
          totalClp: 1000,
          taxTreatment: 'taxed',
        },
      },
    },
    include: { items: true },
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      userId: user.id,
      editionId: edition.id,
      orderItemId: order.items[0]?.id ?? null,
      source: 'purchase',
      status,
    },
  });
  await prisma.certificate.create({
    data: {
      enrollmentId: enrollment.id,
      code: `P${run}${count}`.toUpperCase().slice(0, 16),
      recipientName: 'Ana Soto',
      issuedAt: new Date(),
    },
  });
  return { email, user, order };
}

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await resetCatalogData(prisma);
  const area = await prisma.area.create({ data: { slug: `priv-${run}`, name: 'Privacidad' } });
  const course = await prisma.course.create({
    data: {
      slug: `priv-${run}`,
      title: 'Curso de privacidad',
      summary: 'Resumen',
      description: 'Descripción',
      modality: 'online',
      durationHours: 10,
      areaId: area.id,
      status: 'published',
    },
  });
  courseId = course.id;
  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma,
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
  });
  admin = await loginAs(app, 'mock-admin');
  finance = await loginAs(app, 'mock-finance');
});

afterAll(async () => {
  await prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });
  await app.close();
  await prisma.$disconnect();
});

describe('data subject requests', () => {
  it('summarizes and exports everything stored about the person', async () => {
    const { email, order } = await buyer('completed');
    await newLead(email);

    const summary = DataSubjectSummarySchema.parse((await post('search', email)).json());
    expect(summary).toEqual({
      name: 'Ana Soto',
      orders: 1,
      enrollments: 1,
      certificates: 1,
      leads: 1,
      blockedReason: null,
    });

    const exported = await post('export', email);
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('datos-personales.json');
    expect(exported.json()).toMatchObject({
      account: { email, name: 'Ana Soto' },
      orders: [{ number: order.number, legalAcceptedIp: '200.1.2.3' }],
      enrollments: [{ certificates: [{ recipientName: 'Ana Soto' }] }],
      interest: [{ consentVersion: LEAD_CONSENT.version }],
    });
  });

  it('removes what identifies the person and keeps the sale and the certificate', async () => {
    const { email, user, order } = await buyer('completed');
    await newLead(email);

    expect((await post('anonymize', email)).statusCode).toBe(204);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored).toMatchObject({
      name: ANONYMIZED_NAME,
      rut: null,
      phone: null,
      idpSubject: null,
      sgaUserId: null,
    });
    expect(stored.email).not.toContain('titular');
    expect(await prisma.lead.count({ where: { email } })).toBe(0);

    const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(kept).toMatchObject({ totalClp: 1000, status: 'paid', legalAcceptedIp: null });
    const certificate = await prisma.certificate.findFirstOrThrow({
      where: { enrollment: { userId: user.id } },
    });
    expect(certificate).toMatchObject({ recipientName: 'Ana Soto', status: 'valid' });

    expect((await post('search', email)).statusCode).toBe(404);
    const trail = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'data_subject.anonymize', entityId: user.id },
    });
    expect(JSON.stringify(trail.after)).not.toContain(email);
  });

  it('waits for a course in progress, without touching anything', async () => {
    const { email, user } = await buyer('enrolled');
    await newLead(email);

    const summary = DataSubjectSummarySchema.parse((await post('search', email)).json());
    expect(summary.blockedReason).toContain('curso en curso');
    expect((await post('anonymize', email)).statusCode).toBe(409);
    expect(await prisma.lead.count({ where: { email } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: 'Ana Soto',
    });
  });

  it('handles someone who is only a lead', async () => {
    const email = `solo-${run}@example.cl`;
    await newLead(email);
    const summary = DataSubjectSummarySchema.parse((await post('search', email)).json());
    expect(summary).toMatchObject({ name: null, leads: 1 });
    expect((await post('anonymize', email)).statusCode).toBe(204);
    expect(await prisma.lead.count({ where: { email } })).toBe(0);
  });

  it('answers 404 to an unknown email and 403 without permission', async () => {
    expect((await post('search', `nadie-${run}@example.cl`)).statusCode).toBe(404);
    expect((await post('anonymize', `nadie-${run}@example.cl`)).statusCode).toBe(404);
    expect((await post('search', 'x@example.cl', finance)).statusCode).toBe(403);
  });
});

describe('lead retention', () => {
  it('deletes only unsubscribed leads past the retention period', async () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const leads = new LeadsService({
      prisma,
      audit: new PrismaAuditRecorder(prisma),
      retentionDays: 30,
      now: () => now,
    });
    const old = await newLead(`vieja-${run}@example.cl`);
    const recent = await newLead(`reciente-${run}@example.cl`);
    const active = await newLead(`activa-${run}@example.cl`);
    await prisma.lead.update({
      where: { id: old.id },
      data: { status: 'unsubscribed', unsubscribedAt: new Date('2026-04-01T12:00:00Z') },
    });
    await prisma.lead.update({
      where: { id: recent.id },
      data: { status: 'unsubscribed', unsubscribedAt: new Date('2026-05-20T12:00:00Z') },
    });

    expect(await leads.purgeUnsubscribed()).toBeGreaterThanOrEqual(1);
    const left = await prisma.lead.findMany({
      where: { id: { in: [old.id, recent.id, active.id] } },
    });
    expect(left.map((lead) => lead.id).sort()).toEqual([recent.id, active.id].sort());
  });
});
