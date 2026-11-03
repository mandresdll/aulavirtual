import type { PrismaClient } from '@prisma/client';
import type { Cache } from './infra/cache.js';
import type {
  AreaRecord,
  CatalogRepository,
  CourseDetailRecord,
  CourseSearch,
  EditionRecord,
  SeatUsage,
} from './modules/catalog/catalog.repository.js';
import { parseEnv, type Env } from './config/env.js';

/** Variables mínimas válidas para construir la app en pruebas unitarias. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    MAILER_DRIVER: 'memory',
    ...overrides,
  });
}

/**
 * Cliente de BD para pruebas unitarias que no deben tocar la base: falla si se usa.
 * Las rutas que leen datos reciben un repositorio en memoria en su lugar.
 */
export function unusedPrismaClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (property === 'then') return undefined;
      throw new Error(`PrismaClient.${String(property)} is not available in unit tests`);
    },
  });
}

export const TEST_NOW = new Date('2026-06-01T12:00:00Z');

export function testEdition(overrides: Partial<EditionRecord> = {}): EditionRecord {
  return {
    id: 'edition-1',
    code: 'JS-2026-1',
    startsAt: new Date('2026-06-20T12:00:00Z'),
    endsAt: new Date('2026-07-31T12:00:00Z'),
    enrollmentOpensAt: new Date('2026-05-01T12:00:00Z'),
    enrollmentClosesAt: new Date('2026-06-15T23:00:00Z'),
    priceClp: 89_000,
    taxTreatment: 'exempt',
    capacity: 30,
    freeForCommunity: false,
    schedule: 'Martes 19:00',
    location: null,
    ...overrides,
  };
}

export function testCourse(overrides: Partial<CourseDetailRecord> = {}): CourseDetailRecord {
  return {
    id: 'course-1',
    slug: 'programacion-web',
    title: 'Programación web',
    summary: 'Aprende a crear sitios web.',
    modality: 'online',
    durationHours: 40,
    area: { slug: 'tecnologias', name: 'Tecnologías' },
    imageUrl: '/img/cursos/programacion-web.svg',
    imageAlt: 'Código en una pantalla',
    featured: true,
    updatedAt: new Date('2026-05-10T15:00:00Z'),
    editions: [testEdition()],
    description: 'Curso práctico.',
    objectives: ['Construir páginas web'],
    contents: ['HTML', 'CSS'],
    requirements: null,
    certificationInfo: 'Certificado verificable',
    seoTitle: null,
    seoDescription: null,
    instructors: [{ name: 'Camila Vidal', title: 'Ingeniera', bio: null }],
    ...overrides,
  };
}

/** Repositorio en memoria para probar el servicio y las rutas sin base de datos. */
export class InMemoryCatalogRepository implements CatalogRepository {
  readonly calls: { method: string; args: unknown[] }[] = [];

  constructor(
    public courses: CourseDetailRecord[] = [testCourse()],
    public usage = new Map<string, SeatUsage>(),
    public areas: AreaRecord[] = [],
  ) {}

  async searchCourses(search: CourseSearch) {
    this.calls.push({ method: 'searchCourses', args: [search] });
    const items = this.courses.slice(search.offset, search.offset + search.limit);
    return { total: this.courses.length, items };
  }

  async featuredCourses(limit: number) {
    this.calls.push({ method: 'featuredCourses', args: [limit] });
    return this.courses.filter((course) => course.featured).slice(0, limit);
  }

  async findPublishedCourse(slug: string) {
    this.calls.push({ method: 'findPublishedCourse', args: [slug] });
    return this.courses.find((course) => course.slug === slug) ?? null;
  }

  async listAreas() {
    this.calls.push({ method: 'listAreas', args: [] });
    return this.areas;
  }

  async seatUsage(editionIds: readonly string[]) {
    this.calls.push({ method: 'seatUsage', args: [editionIds] });
    return new Map(
      editionIds.map((id) => [id, this.usage.get(id) ?? { taken: 0, reserved: 0 }] as const),
    );
  }

  async publishedCourseSlugs() {
    this.calls.push({ method: 'publishedCourseSlugs', args: [] });
    return this.courses.map(({ slug, updatedAt }) => ({ slug, updatedAt }));
  }
}

/** Caché en memoria con la misma semántica que `RedisCache` (JSON), sin expiración. */
export class MemoryCache implements Cache {
  readonly store = new Map<string, string>();

  async getOrSet<T>(key: string, _ttl: number, load: () => Promise<T>): Promise<T> {
    const result = await this.getOrSetMany([key], _ttl, async () => new Map([[key, await load()]]));
    return result.get(key) as T;
  }

  async getOrSetMany<T>(
    keys: readonly string[],
    _ttl: number,
    load: (missing: readonly string[]) => Promise<Map<string, T>>,
  ): Promise<Map<string, T>> {
    const found = new Map<string, T>();
    for (const key of keys) {
      const raw = this.store.get(key);
      if (raw !== undefined) found.set(key, JSON.parse(raw) as T);
    }
    const missing = keys.filter((key) => !found.has(key));
    if (missing.length > 0) {
      for (const [key, value] of await load(missing)) {
        this.store.set(key, JSON.stringify(value));
        found.set(key, value);
      }
    }
    return found;
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }
}
