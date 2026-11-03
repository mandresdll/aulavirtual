import type { Edition, Modality } from '@plataforma/shared';
import type { CourseDetailWithSeo } from '../catalog/catalog.service.js';

/** Datos del sitio para armar URLs absolutas y metadatos. */
export interface SiteInfo {
  /** URL pública de la SPA, sin barra final (PUBLIC_WEB_URL). */
  baseUrl: string;
  allowIndexing: boolean;
}

export const SITE_NAME = 'Cursos UTA · CFT Estatal de Magallanes';
export const ORGANIZATION_NAME =
  'Centro de Formación Técnica Estatal de Magallanes y la Antártica Chilena';
export const DEFAULT_DESCRIPTION =
  'Catálogo de cursos de la Unidad de Tecnologías para el Aprendizaje del CFT Estatal de ' +
  'Magallanes y la Antártica Chilena.';

const CATALOG_DESCRIPTION =
  'Busca cursos de la UTA del CFT Estatal de Magallanes por área, modalidad y fecha: en línea, ' +
  'presenciales y mixtos, con certificación.';

const DESCRIPTION_MAX = 160;

export interface HeadTags {
  title: string;
  description: string;
  /** Ruta canónica (sin dominio). Sin ella no se publican canonical ni og:url. */
  canonicalPath?: string;
  noindex?: boolean;
  ogType?: 'website' | 'article';
  image?: { url: string; alt: string };
  jsonLd?: Record<string, unknown>;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** JSON seguro dentro de `<script>`: impide cerrar la etiqueta desde los datos. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function absoluteUrl(site: SiteInfo, pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${site.baseUrl}${pathOrUrl}`;
}

/** Etiquetas del `<head>` que nginx inserta en el HTML de la SPA (SSI). */
export function renderHead(tags: HeadTags, site: SiteInfo): string {
  const title = tags.title === SITE_NAME ? SITE_NAME : `${tags.title} | ${SITE_NAME}`;
  const description = truncate(tags.description, DESCRIPTION_MAX);
  const url = tags.canonicalPath ? absoluteUrl(site, tags.canonicalPath) : undefined;
  const noindex = tags.noindex || !site.allowIndexing;
  const attr = escapeHtml;

  const lines = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    noindex ? '<meta name="robots" content="noindex, nofollow" />' : undefined,
    url ? `<link rel="canonical" href="${attr(url)}" />` : undefined,
    `<meta property="og:site_name" content="${attr(SITE_NAME)}" />`,
    '<meta property="og:locale" content="es_CL" />',
    `<meta property="og:type" content="${tags.ogType ?? 'website'}" />`,
    `<meta property="og:title" content="${attr(tags.title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    url ? `<meta property="og:url" content="${attr(url)}" />` : undefined,
    tags.image
      ? `<meta property="og:image" content="${attr(absoluteUrl(site, tags.image.url))}" />`
      : undefined,
    tags.image ? `<meta property="og:image:alt" content="${attr(tags.image.alt)}" />` : undefined,
    `<meta name="twitter:card" content="${tags.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${attr(tags.title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    tags.image
      ? `<meta name="twitter:image" content="${attr(absoluteUrl(site, tags.image.url))}" />`
      : undefined,
    tags.jsonLd
      ? `<script type="application/ld+json">${serializeJsonLd(tags.jsonLd)}</script>`
      : undefined,
  ];
  return lines.filter((line) => line !== undefined).join('\n');
}

const COURSE_MODE: Record<Modality, string> = {
  online: 'Online',
  in_person: 'Onsite',
  blended: 'Blended',
};

function offerAvailability(edition: Edition, now: Date): string {
  if (edition.enrollmentOpen) {
    return edition.availableSeats > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut';
  }
  if (edition.enrollmentOpensAt && now < new Date(edition.enrollmentOpensAt)) {
    return 'https://schema.org/PreOrder';
  }
  return 'https://schema.org/Discontinued';
}

/** Datos estructurados schema.org `Course` con sus ediciones como `CourseInstance`. */
export function courseJsonLd(
  course: CourseDetailWithSeo,
  site: SiteInfo,
  now: Date,
): Record<string, unknown> {
  const url = absoluteUrl(site, `/cursos/${course.slug}`);
  const workload = `PT${course.durationHours}H`;
  const instructors = course.instructors.map((instructor) => ({
    '@type': 'Person',
    name: instructor.name,
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.summary,
    url,
    inLanguage: 'es-CL',
    ...(course.imageUrl ? { image: absoluteUrl(site, course.imageUrl) } : {}),
    provider: {
      '@type': 'EducationalOrganization',
      name: ORGANIZATION_NAME,
      url: site.baseUrl,
    },
    timeRequired: workload,
    about: course.area.name,
    ...(course.objectives.length > 0 ? { teaches: course.objectives } : {}),
    ...(course.requirements ? { coursePrerequisites: course.requirements } : {}),
    ...(course.certificationInfo ? { educationalCredentialAwarded: course.certificationInfo } : {}),
    ...(course.editions.length > 0
      ? {
          offers: course.editions.map((edition) => ({
            '@type': 'Offer',
            category: edition.priceClp === 0 ? 'Free' : 'Paid',
            price: edition.priceClp,
            priceCurrency: 'CLP',
            availability: offerAvailability(edition, now),
            validThrough: edition.enrollmentClosesAt,
            url,
          })),
          hasCourseInstance: course.editions.map((edition) => ({
            '@type': 'CourseInstance',
            name: `${course.title} (${edition.code})`,
            courseMode: COURSE_MODE[course.modality],
            courseWorkload: workload,
            startDate: edition.startsAt,
            endDate: edition.endsAt,
            ...(edition.location ? { location: { '@type': 'Place', name: edition.location } } : {}),
            ...(instructors.length > 0 ? { instructor: instructors } : {}),
          })),
        }
      : {}),
  };
}

export function courseHead(course: CourseDetailWithSeo, site: SiteInfo, now: Date): HeadTags {
  return {
    title: course.seoTitle ?? course.title,
    description: course.seoDescription ?? course.summary,
    canonicalPath: `/cursos/${course.slug}`,
    ogType: 'article',
    ...(course.imageUrl
      ? { image: { url: course.imageUrl, alt: course.imageAlt ?? course.title } }
      : {}),
    jsonLd: courseJsonLd(course, site, now),
  };
}

const COURSE_PATH = /^\/cursos\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

export type PageRoute =
  { kind: 'home' } | { kind: 'catalog' } | { kind: 'course'; slug: string } | { kind: 'other' };

/** Identifica la página pública a partir de la URL original del navegador. */
export function routeFromUri(uri: string | undefined): PageRoute {
  const path = (uri ?? '/').split(/[?#]/, 1)[0] ?? '/';
  if (path === '/' || path === '') return { kind: 'home' };
  if (path === '/cursos' || path === '/cursos/') return { kind: 'catalog' };
  const course = COURSE_PATH.exec(path);
  if (course?.[1]) return { kind: 'course', slug: course[1] };
  return { kind: 'other' };
}

/** Metadatos de cada tipo de página. Solo las rutas públicas conocidas son indexables. */
export async function headForRoute(
  route: PageRoute,
  findCourse: (slug: string) => Promise<CourseDetailWithSeo | null>,
  site: SiteInfo,
  now: Date,
): Promise<HeadTags> {
  switch (route.kind) {
    case 'home':
      return { title: SITE_NAME, description: DEFAULT_DESCRIPTION, canonicalPath: '/' };
    case 'catalog':
      return {
        title: 'Catálogo de cursos',
        description: CATALOG_DESCRIPTION,
        canonicalPath: '/cursos',
      };
    case 'course': {
      const course = await findCourse(route.slug);
      if (course) return courseHead(course, site, now);
      return { title: 'Curso no encontrado', description: DEFAULT_DESCRIPTION, noindex: true };
    }
    case 'other':
      return { title: SITE_NAME, description: DEFAULT_DESCRIPTION, noindex: true };
  }
}

export function renderSitemap(
  courses: readonly { slug: string; updatedAt: string }[],
  site: SiteInfo,
): string {
  const urls = [
    { loc: absoluteUrl(site, '/'), lastmod: undefined },
    { loc: absoluteUrl(site, '/cursos'), lastmod: undefined },
    ...courses.map((course) => ({
      loc: absoluteUrl(site, `/cursos/${course.slug}`),
      lastmod: course.updatedAt.slice(0, 10),
    })),
  ];
  const body = urls
    .map(
      ({ loc, lastmod }) =>
        `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${body}\n</urlset>\n`
  );
}

export function renderRobots(site: SiteInfo): string {
  if (!site.allowIndexing) {
    return '# Indexación deshabilitada en este ambiente (SEO_ALLOW_INDEXING=false)\nUser-agent: *\nDisallow: /\n';
  }
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${absoluteUrl(site, '/sitemap.xml')}`,
    '',
  ].join('\n');
}
