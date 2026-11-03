import {
  CourseDetailSchema,
  CourseListResponseSchema,
  ErrorResponseSchema,
  FeaturedCoursesResponseSchema,
} from '@plataforma/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createIntegrations } from '../../integrations/index.js';
import {
  InMemoryCatalogRepository,
  TEST_NOW,
  testCourse,
  testEnv,
  unusedPrismaClient,
} from '../../test-support.js';

let app: FastifyInstance | undefined;

async function createApp(
  repository = new InMemoryCatalogRepository(),
  env: Record<string, string> = {},
) {
  const config = testEnv({ PUBLIC_WEB_URL: 'https://cursos.example.cl', ...env });
  app = await buildApp({
    env: config,
    integrations: createIntegrations(config),
    readinessChecks: {},
    prisma: unusedPrismaClient(),
    catalogRepository: repository,
    now: () => TEST_NOW,
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('catalog API', () => {
  it('GET /api/catalog/courses returns a page validated by the shared schema', async () => {
    const response = await (await createApp()).inject('/api/catalog/courses?page=1&pageSize=5');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=15');
    const body = CourseListResponseSchema.parse(response.json());
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 5, totalPages: 1 });
    expect(body.items[0]).toMatchObject({
      slug: 'programacion-web',
      nextEdition: { capacity: 30 },
    });
  });

  it('accepts empty filters as sent by an HTML form', async () => {
    const response = await (
      await createApp()
    ).inject('/api/catalog/courses?q=&area=&modality=&from=&to=');
    expect(response.statusCode).toBe(200);
  });

  it('rejects invalid filters with a Spanish 400 error', async () => {
    const response = await (
      await createApp()
    ).inject('/api/catalog/courses?modality=hibrida&from=2026-13-01');
    expect(response.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/catalog/courses/featured returns only featured courses', async () => {
    const repository = new InMemoryCatalogRepository([
      testCourse(),
      testCourse({ id: 'c2', slug: 'otro', featured: false }),
    ]);
    const response = await (await createApp(repository)).inject('/api/catalog/courses/featured');
    const body = FeaturedCoursesResponseSchema.parse(response.json());
    expect(body.items.map((course) => course.slug)).toEqual(['programacion-web']);
  });

  it('GET /api/catalog/courses/:slug returns the course detail', async () => {
    const response = await (await createApp()).inject('/api/catalog/courses/programacion-web');
    expect(response.statusCode).toBe(200);
    const course = CourseDetailSchema.parse(response.json());
    expect(course.instructors).toEqual([{ name: 'Camila Vidal', title: 'Ingeniera', bio: null }]);
    // Los campos SEO internos no se exponen en la API pública.
    expect(response.json()).not.toHaveProperty('seoTitle');
  });

  it('answers 404 in Spanish for unknown courses and 400 for malformed slugs', async () => {
    const api = await createApp();
    const missing = await api.inject('/api/catalog/courses/no-existe');
    expect(missing.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(missing.json()).error.message).toBe(
      'El curso no existe o no está disponible.',
    );
    expect((await api.inject('/api/catalog/courses/Con%20Espacios')).statusCode).toBe(400);
  });

  it('GET /api/catalog/areas lists areas with published courses', async () => {
    const repository = new InMemoryCatalogRepository([], new Map(), [
      { slug: 'ti', name: 'TI', description: null, publishedCourses: 1 },
    ]);
    const response = await (await createApp(repository)).inject('/api/catalog/areas');
    expect(response.json()).toEqual({
      items: [{ slug: 'ti', name: 'TI', description: null, courseCount: 1 }],
    });
  });

  it('documents the catalog and SEO endpoints in OpenAPI', async () => {
    const response = await (await createApp()).inject('/api/docs/json');
    expect(response.statusCode).toBe(200);
    const paths = Object.keys((response.json() as { paths: Record<string, unknown> }).paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/catalog/courses',
        '/api/catalog/courses/featured',
        '/api/catalog/courses/{slug}',
        '/api/catalog/areas',
        '/api/seo/head',
        '/api/seo/sitemap.xml',
        '/api/seo/robots.txt',
      ]),
    );
  });
});

describe('SEO endpoints', () => {
  it('GET /api/seo/head renders course metadata for the original URI', async () => {
    const response = await (
      await createApp()
    ).inject({
      url: '/api/seo/head',
      headers: { 'x-original-uri': '/cursos/programacion-web?utm_source=facebook' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('<title>Programación web | Cursos UTA');
    expect(response.body).toContain(
      '<link rel="canonical" href="https://cursos.example.cl/cursos/programacion-web" />',
    );
    expect(response.body).toContain('<script type="application/ld+json">');
    expect(response.body).toContain('"@type":"Course"');
    // En pruebas SEO_ALLOW_INDEXING=false: nada se indexa.
    expect(response.body).toContain('noindex');
  });

  it('GET /api/seo/head falls back to the site defaults', async () => {
    const response = await (
      await createApp(undefined, { SEO_ALLOW_INDEXING: 'true' })
    ).inject('/api/seo/head');
    expect(response.body).toContain('<title>Cursos UTA · CFT Estatal de Magallanes</title>');
    expect(response.body).toContain('href="https://cursos.example.cl/"');
    expect(response.body).not.toContain('noindex');
  });

  it('GET /api/seo/sitemap.xml lists published courses', async () => {
    const response = await (await createApp()).inject('/api/seo/sitemap.xml');
    expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
    expect(response.body).toContain('<loc>https://cursos.example.cl/cursos/programacion-web</loc>');
  });

  it('GET /api/seo/robots.txt follows SEO_ALLOW_INDEXING', async () => {
    const blocked = await (await createApp()).inject('/api/seo/robots.txt');
    expect(blocked.body).toContain('Disallow: /\n');
    await app?.close();
    const allowed = await (
      await createApp(undefined, { SEO_ALLOW_INDEXING: 'true' })
    ).inject('/api/seo/robots.txt');
    expect(allowed.body).toContain('Sitemap: https://cursos.example.cl/sitemap.xml');
  });
});
