import {
  CSRF_HEADER,
  DEFAULT_SITE_SETTINGS,
  SiteSettingsSchema,
  type SiteSettings,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infra/database.js';
import { createIntegrations } from '../../src/integrations/index.js';
import { MemorySessionStore } from '../../src/modules/auth/session-store.js';
import { loginAs, MemoryCache, type TestSession } from '../../src/test-support.js';
import { integrationEnv } from './helpers.js';

/** Configuración del sitio contra PostgreSQL real (RF-07). */
const WEB_URL = 'https://cursos.example.cl';
const env = integrationEnv({ PUBLIC_WEB_URL: WEB_URL });

let prisma: PrismaClient;
let app: FastifyInstance;
let admin: TestSession;
let editor: TestSession;

const save = (settings: Partial<SiteSettings>, session = admin) =>
  app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: { cookie: session.cookie, [CSRF_HEADER]: session.csrfToken, origin: WEB_URL },
    payload: settings,
  });

const read = async () =>
  SiteSettingsSchema.parse((await app.inject({ url: '/api/settings' })).json());

beforeAll(async () => {
  prisma = createPrismaClient(env.DATABASE_URL);
  await prisma.setting.deleteMany({ where: { key: 'site' } });
  app = await buildApp({
    env,
    integrations: createIntegrations(env),
    readinessChecks: {},
    prisma,
    sessionStore: new MemorySessionStore(),
    cache: new MemoryCache(),
  });
  admin = await loginAs(app, 'mock-admin');
  editor = await loginAs(app, 'mock-editor');
});

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: 'site' } });
  await app.close();
  await prisma.$disconnect();
});

describe('site settings', () => {
  it('starts with the default texts, for anyone', async () => {
    expect(await read()).toEqual(DEFAULT_SITE_SETTINGS);
  });

  it('saves, shows the change at once and leaves it in the audit log', async () => {
    const settings = {
      ...DEFAULT_SITE_SETTINGS,
      heroTitle: 'Matrícula abierta',
      notice: 'Inscripciones hasta el viernes',
      brandColor: '#1d4ed8',
    };
    expect((await save(settings)).statusCode).toBe(200);
    expect(await read()).toEqual(settings);
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.update' },
      orderBy: { id: 'desc' },
    });
    expect(entry.after).toMatchObject({ heroTitle: 'Matrícula abierta' });
  });

  it('rejects a color with poor contrast, and editors cannot change it', async () => {
    const light = await save({ ...DEFAULT_SITE_SETTINGS, brandColor: '#ffee00' });
    expect(light.statusCode).toBe(400);
    expect((await save(DEFAULT_SITE_SETTINGS, editor)).statusCode).toBe(403);
  });

  it('falls back to the defaults if the stored value is no longer valid', async () => {
    await prisma.setting.update({ where: { key: 'site' }, data: { value: { old: true } } });
    const fresh = await buildApp({
      env,
      integrations: createIntegrations(env),
      readinessChecks: {},
      prisma,
      sessionStore: new MemorySessionStore(),
      cache: new MemoryCache(),
    });
    const response = await fresh.inject({ url: '/api/settings' });
    expect(response.json()).toEqual(DEFAULT_SITE_SETTINGS);
    await fresh.close();
  });
});
