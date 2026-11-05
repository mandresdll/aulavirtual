import { describe, expect, it } from 'vitest';
import { TEST_NOW } from '../../test-support.js';
import type { CourseDetailWithSeo } from '../catalog/catalog.service.js';
import {
  SITE_NAME,
  courseJsonLd,
  escapeHtml,
  headForRoute,
  renderHead,
  renderRobots,
  renderSitemap,
  routeFromUri,
  serializeJsonLd,
} from './seo.js';

const site = { baseUrl: 'https://cursos.example.cl', allowIndexing: true };

function course(overrides: Partial<CourseDetailWithSeo> = {}): CourseDetailWithSeo {
  const edition = {
    id: 'e1',
    code: 'JS-1',
    startsAt: '2026-06-20T12:00:00.000Z',
    endsAt: '2026-07-31T12:00:00.000Z',
    enrollmentOpensAt: '2026-05-01T12:00:00.000Z',
    enrollmentClosesAt: '2026-06-15T23:00:00.000Z',
    priceClp: 89_000,
    taxTreatment: 'exempt' as const,
    capacity: 30,
    availableSeats: 4,
    enrollmentOpen: true,
    freeForCommunity: false,
    communityProfiles: [],
    schedule: null,
    location: 'Sede Punta Arenas',
  };
  return {
    slug: 'programacion-web',
    title: 'Programación web',
    summary: 'Aprende a crear sitios web.',
    modality: 'blended',
    durationHours: 40,
    area: { slug: 'ti', name: 'Tecnologías' },
    imageUrl: '/img/cursos/programacion-web.svg',
    imageAlt: 'Código',
    featured: true,
    nextEdition: edition,
    description: 'Curso práctico.',
    objectives: ['Construir páginas web'],
    contents: ['HTML'],
    requirements: 'Computador',
    certificationInfo: 'Certificado verificable',
    instructors: [{ name: 'Camila Vidal', title: null, bio: null }],
    editions: [edition],
    updatedAt: '2026-05-10T15:00:00.000Z',
    seoTitle: null,
    seoDescription: null,
    ...overrides,
  };
}

describe('routeFromUri', () => {
  it.each([
    ['/', { kind: 'home' }],
    [undefined, { kind: 'home' }],
    ['/?utm_source=x', { kind: 'home' }],
    ['/cursos', { kind: 'catalog' }],
    ['/cursos/?q=web', { kind: 'catalog' }],
    ['/cursos/programacion-web', { kind: 'course', slug: 'programacion-web' }],
    ['/cursos/programacion-web/?utm_campaign=x#top', { kind: 'course', slug: 'programacion-web' }],
    ['/cursos/Mayusculas', { kind: 'other' }],
    ['/cursos/a/b', { kind: 'other' }],
    ['/admin', { kind: 'other' }],
  ])('maps %s', (uri, expected) => {
    expect(routeFromUri(uri)).toEqual(expected);
  });
});

describe('escaping', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('prevents closing the script tag from JSON-LD data', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(json).not.toContain('</script>');
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});

describe('renderHead', () => {
  it('renders title, description, canonical, Open Graph and Twitter Card tags', () => {
    const html = renderHead(
      {
        title: 'Programación web',
        description: 'Aprende <HTML>',
        canonicalPath: '/cursos/programacion-web',
        image: { url: '/img/x.svg', alt: 'Código' },
      },
      site,
    );
    expect(html).toContain(`<title>Programación web | ${SITE_NAME}</title>`);
    expect(html).toContain('<meta name="description" content="Aprende &lt;HTML&gt;" />');
    expect(html).toContain(
      '<link rel="canonical" href="https://cursos.example.cl/cursos/programacion-web" />',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://cursos.example.cl/img/x.svg" />',
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('noindex');
  });

  it('marks every page as noindex when indexing is disabled', () => {
    const html = renderHead(
      { title: SITE_NAME, description: 'x' },
      { ...site, allowIndexing: false },
    );
    expect(html).toContain('<title>Cursos UTA · CFT Estatal de Magallanes</title>');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it('truncates long descriptions on a word boundary', () => {
    const html = renderHead({ title: 'T', description: 'palabra '.repeat(40) }, site);
    const description = /name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('palabra…')).toBe(true);
  });
});

describe('courseJsonLd', () => {
  it('describes the course with offers and course instances in CLP', () => {
    const data = courseJsonLd(course(), site, TEST_NOW);
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'Programación web',
      url: 'https://cursos.example.cl/cursos/programacion-web',
      image: 'https://cursos.example.cl/img/cursos/programacion-web.svg',
      provider: { '@type': 'EducationalOrganization' },
      timeRequired: 'PT40H',
      coursePrerequisites: 'Computador',
      offers: [
        {
          '@type': 'Offer',
          category: 'Paid',
          price: 89_000,
          priceCurrency: 'CLP',
          availability: 'https://schema.org/InStock',
        },
      ],
      hasCourseInstance: [
        {
          '@type': 'CourseInstance',
          courseMode: 'Blended',
          startDate: '2026-06-20T12:00:00.000Z',
          location: { '@type': 'Place', name: 'Sede Punta Arenas' },
          instructor: [{ '@type': 'Person', name: 'Camila Vidal' }],
        },
      ],
    });
  });

  it('reports sold-out, pre-order and closed editions', () => {
    const [edition] = course().editions;
    if (!edition) throw new Error('fixture');
    const availability = (overrides: Partial<typeof edition>) =>
      (
        courseJsonLd(course({ editions: [{ ...edition, ...overrides }] }), site, TEST_NOW)
          .offers as { availability: string }[]
      )[0]?.availability;

    expect(availability({ availableSeats: 0 })).toBe('https://schema.org/SoldOut');
    expect(
      availability({ enrollmentOpen: false, enrollmentOpensAt: '2026-07-01T00:00:00.000Z' }),
    ).toBe('https://schema.org/PreOrder');
    expect(availability({ enrollmentOpen: false })).toBe('https://schema.org/Discontinued');
  });

  it('omits offers when the course has no current editions', () => {
    const data = courseJsonLd(course({ editions: [], nextEdition: null }), site, TEST_NOW);
    expect(data).not.toHaveProperty('offers');
    expect(data).not.toHaveProperty('hasCourseInstance');
  });
});

describe('headForRoute', () => {
  const find = async (slug: string) => (slug === 'programacion-web' ? course() : null);

  it('uses the course SEO fields when present and embeds JSON-LD', async () => {
    const head = await headForRoute(
      { kind: 'course', slug: 'programacion-web' },
      async () => course({ seoTitle: 'JavaScript desde cero', seoDescription: 'Desc SEO' }),
      site,
      TEST_NOW,
    );
    expect(head).toMatchObject({
      title: 'JavaScript desde cero',
      description: 'Desc SEO',
      canonicalPath: '/cursos/programacion-web',
    });
    expect(head.jsonLd).toBeDefined();
  });

  it('marks unknown courses and non-public routes as noindex', async () => {
    expect(await headForRoute({ kind: 'course', slug: 'x' }, find, site, TEST_NOW)).toMatchObject({
      title: 'Curso no encontrado',
      noindex: true,
    });
    expect(await headForRoute({ kind: 'other' }, find, site, TEST_NOW)).toMatchObject({
      noindex: true,
    });
  });

  it('gives the home and catalog pages their canonical URLs', async () => {
    expect((await headForRoute({ kind: 'home' }, find, site, TEST_NOW)).canonicalPath).toBe('/');
    expect((await headForRoute({ kind: 'catalog' }, find, site, TEST_NOW)).canonicalPath).toBe(
      '/cursos',
    );
  });
});

describe('sitemap and robots', () => {
  it('lists the public pages and every published course', () => {
    const xml = renderSitemap([{ slug: 'excel', updatedAt: '2026-05-10T15:00:00.000Z' }], site);
    expect(xml).toContain('<loc>https://cursos.example.cl/</loc>');
    expect(xml).toContain('<loc>https://cursos.example.cl/cursos</loc>');
    expect(xml).toContain(
      '<url><loc>https://cursos.example.cl/cursos/excel</loc><lastmod>2026-05-10</lastmod></url>',
    );
  });

  it('points crawlers to the sitemap and away from private areas', () => {
    const robots = renderRobots(site);
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: https://cursos.example.cl/sitemap.xml');
  });

  it('blocks everything when indexing is disabled', () => {
    expect(renderRobots({ ...site, allowIndexing: false })).toMatch(
      /User-agent: \*\nDisallow: \/\n$/,
    );
  });
});
