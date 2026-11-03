import {
  availableSeats,
  nextIsoDate,
  startOfLocalDay,
  type Area,
  type CourseCard,
  type CourseDetail,
  type CourseListQuery,
  type CourseListResponse,
  type Edition,
} from '@plataforma/shared';
import type { Cache } from '../../infra/cache.js';
import type {
  CatalogRepository,
  CourseDetailRecord,
  CourseRecord,
  EditionRecord,
  SeatUsage,
} from './catalog.repository.js';
import { buildTsQuery } from './search.js';

export interface CatalogServiceOptions {
  repository: CatalogRepository;
  cache: Cache;
  catalogTtlSeconds: number;
  seatsTtlSeconds: number;
  now?: () => Date;
}

/** Edición sin los datos que cambian minuto a minuto (cupos y plazo); así se guarda en caché. */
type CachedEdition = Omit<Edition, 'availableSeats' | 'enrollmentOpen'>;
type CachedCard = Omit<CourseCard, 'nextEdition'> & { editions: CachedEdition[] };
type CachedDetail = Omit<CourseDetail, 'nextEdition' | 'editions'> & {
  editions: CachedEdition[];
  seoTitle: string | null;
  seoDescription: string | null;
};

/** Ficha pública con los textos SEO propios del curso (los usa el módulo SEO). */
export type CourseDetailWithSeo = CourseDetail & {
  seoTitle: string | null;
  seoDescription: string | null;
};

const FEATURED_LIMIT = 6;
const KEY_PREFIX = 'catalog:v1:';

function toCachedEdition(edition: EditionRecord): CachedEdition {
  return {
    id: edition.id,
    code: edition.code,
    startsAt: edition.startsAt.toISOString(),
    endsAt: edition.endsAt.toISOString(),
    enrollmentOpensAt: edition.enrollmentOpensAt?.toISOString() ?? null,
    enrollmentClosesAt: edition.enrollmentClosesAt.toISOString(),
    priceClp: edition.priceClp,
    taxTreatment: edition.taxTreatment,
    capacity: edition.capacity,
    freeForCommunity: edition.freeForCommunity,
    schedule: edition.schedule,
    location: edition.location,
  };
}

function toCachedCard(course: CourseRecord): CachedCard {
  return {
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    modality: course.modality,
    durationHours: course.durationHours,
    area: { slug: course.area.slug, name: course.area.name },
    imageUrl: course.imageUrl,
    imageAlt: course.imageAlt,
    featured: course.featured,
    editions: course.editions.map(toCachedEdition),
  };
}

function toCachedDetail(course: CourseDetailRecord): CachedDetail {
  return {
    ...toCachedCard(course),
    description: course.description,
    objectives: course.objectives,
    contents: course.contents,
    requirements: course.requirements,
    certificationInfo: course.certificationInfo,
    instructors: course.instructors,
    updatedAt: course.updatedAt.toISOString(),
    seoTitle: course.seoTitle,
    seoDescription: course.seoDescription,
  };
}

/** Inscripciones abiertas: dentro del plazo de la edición (los cupos se evalúan aparte). */
export function isEnrollmentOpen(
  edition: Pick<Edition, 'enrollmentOpensAt' | 'enrollmentClosesAt'>,
  now: Date,
): boolean {
  const opens = edition.enrollmentOpensAt ? Date.parse(edition.enrollmentOpensAt) : -Infinity;
  return now.getTime() >= opens && now.getTime() < Date.parse(edition.enrollmentClosesAt);
}

/**
 * Edición que se destaca en la tarjeta: la primera con inscripciones abiertas y cupos;
 * si no hay, la primera con inscripciones abiertas; si no, la próxima en comenzar.
 */
export function pickNextEdition(editions: readonly Edition[]): Edition | null {
  return (
    editions.find((edition) => edition.enrollmentOpen && edition.availableSeats > 0) ??
    editions.find((edition) => edition.enrollmentOpen) ??
    editions[0] ??
    null
  );
}

export class CatalogService {
  private readonly now: () => Date;

  constructor(private readonly options: CatalogServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async listCourses(query: CourseListQuery): Promise<CourseListResponse> {
    const { repository, cache, catalogTtlSeconds } = this.options;
    const key = `${KEY_PREFIX}list:${JSON.stringify(query)}`;
    const page = await cache.getOrSet(key, catalogTtlSeconds, async () => {
      const tsQuery = buildTsQuery(query.q);
      const result = await repository.searchCourses({
        ...(tsQuery ? { tsQuery } : {}),
        ...(query.area ? { areaSlug: query.area } : {}),
        ...(query.modality ? { modality: query.modality } : {}),
        ...(query.from ? { startsFrom: startOfLocalDay(query.from) } : {}),
        ...(query.to ? { startsBefore: startOfLocalDay(nextIsoDate(query.to)) } : {}),
        offset: (query.page - 1) * query.pageSize,
        limit: query.pageSize,
        now: this.now(),
      });
      return { total: result.total, items: result.items.map(toCachedCard) };
    });

    return {
      items: await this.finalizeCards(page.items),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      totalPages: Math.ceil(page.total / query.pageSize),
    };
  }

  async featuredCourses(): Promise<CourseCard[]> {
    const { repository, cache, catalogTtlSeconds } = this.options;
    const cards = await cache.getOrSet(`${KEY_PREFIX}featured`, catalogTtlSeconds, async () =>
      (await repository.featuredCourses(FEATURED_LIMIT, this.now())).map(toCachedCard),
    );
    return this.finalizeCards(cards);
  }

  async getCourse(slug: string): Promise<CourseDetailWithSeo | null> {
    const { repository, cache, catalogTtlSeconds } = this.options;
    // Un curso inexistente se guarda como `null` para no consultar la BD en cada intento.
    const cached = await cache.getOrSet<CachedDetail | null>(
      `${KEY_PREFIX}course:${slug}`,
      catalogTtlSeconds,
      async () => {
        const course = await repository.findPublishedCourse(slug, this.now());
        return course ? toCachedDetail(course) : null;
      },
    );
    if (!cached) return null;

    const editions = await this.finalizeEditions(cached.editions);
    return { ...cached, editions, nextEdition: pickNextEdition(editions) };
  }

  async listAreas(): Promise<Area[]> {
    const { repository, cache, catalogTtlSeconds } = this.options;
    return cache.getOrSet(`${KEY_PREFIX}areas`, catalogTtlSeconds, async () =>
      (await repository.listAreas())
        .filter((area) => area.publishedCourses > 0)
        .map(({ publishedCourses, ...area }) => ({ ...area, courseCount: publishedCourses })),
    );
  }

  async sitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
    const { repository, cache, catalogTtlSeconds } = this.options;
    return cache.getOrSet(`${KEY_PREFIX}sitemap`, catalogTtlSeconds, async () =>
      (await repository.publishedCourseSlugs()).map((course) => ({
        slug: course.slug,
        updatedAt: course.updatedAt.toISOString(),
      })),
    );
  }

  private async finalizeCards(cards: readonly CachedCard[]): Promise<CourseCard[]> {
    const usage = await this.seatUsage(cards.flatMap((card) => card.editions.map((e) => e.id)));
    const now = this.now();
    return cards.map(({ editions, ...card }) => ({
      ...card,
      nextEdition: pickNextEdition(editions.map((edition) => withLiveData(edition, usage, now))),
    }));
  }

  private async finalizeEditions(editions: readonly CachedEdition[]): Promise<Edition[]> {
    const usage = await this.seatUsage(editions.map((edition) => edition.id));
    const now = this.now();
    return editions.map((edition) => withLiveData(edition, usage, now));
  }

  /** Cupos con caché corta por edición (RF-01: "en tiempo real o con caché corta"). */
  private async seatUsage(editionIds: readonly string[]): Promise<Map<string, SeatUsage>> {
    const { repository, cache, seatsTtlSeconds } = this.options;
    const unique = [...new Set(editionIds)];
    const keyOf = (id: string) => `${KEY_PREFIX}seats:${id}`;
    const cached = await cache.getOrSetMany<SeatUsage>(
      unique.map(keyOf),
      seatsTtlSeconds,
      async (missingKeys) => {
        const ids = missingKeys.map((key) => key.slice(keyOf('').length));
        const usage = await repository.seatUsage(ids, this.now());
        return new Map(ids.map((id) => [keyOf(id), usage.get(id) ?? { taken: 0, reserved: 0 }]));
      },
    );
    return new Map(unique.map((id) => [id, cached.get(keyOf(id)) ?? { taken: 0, reserved: 0 }]));
  }
}

function withLiveData(edition: CachedEdition, usage: Map<string, SeatUsage>, now: Date): Edition {
  const seats = usage.get(edition.id) ?? { taken: 0, reserved: 0 };
  return {
    ...edition,
    availableSeats: availableSeats(edition.capacity, seats.taken, seats.reserved),
    enrollmentOpen: isEnrollmentOpen(edition, now),
  };
}

/** Claves de caché del catálogo, para invalidarlas al editar (panel admin, Fase 2). */
export const catalogCacheKeys = {
  /** Prefijo de todas las páginas del listado (una clave por combinación de filtros). */
  listPrefix: `${KEY_PREFIX}list:`,
  course: (slug: string) => `${KEY_PREFIX}course:${slug}`,
  seats: (editionId: string) => `${KEY_PREFIX}seats:${editionId}`,
  featured: `${KEY_PREFIX}featured`,
  areas: `${KEY_PREFIX}areas`,
  sitemap: `${KEY_PREFIX}sitemap`,
} as const;
