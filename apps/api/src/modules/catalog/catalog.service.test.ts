import { describe, expect, it } from 'vitest';
import { NoCache, type Cache } from '../../infra/cache.js';
import {
  InMemoryCatalogRepository,
  MemoryCache,
  TEST_NOW,
  testCourse,
  testEdition,
} from '../../test-support.js';
import { CatalogService, isEnrollmentOpen, pickNextEdition } from './catalog.service.js';

function createService(
  repository = new InMemoryCatalogRepository(),
  cache: Cache = new MemoryCache(),
) {
  return {
    repository,
    cache,
    service: new CatalogService({
      repository,
      cache,
      catalogTtlSeconds: 60,
      seatsTtlSeconds: 15,
      now: () => TEST_NOW,
    }),
  };
}

describe('isEnrollmentOpen', () => {
  const edition = {
    enrollmentOpensAt: '2026-05-01T00:00:00.000Z',
    enrollmentClosesAt: '2026-06-15T00:00:00.000Z',
  };

  it('is open between the opening and closing dates', () => {
    expect(isEnrollmentOpen(edition, new Date('2026-06-01T00:00:00Z'))).toBe(true);
  });

  it('is closed before opening and from the closing instant on', () => {
    expect(isEnrollmentOpen(edition, new Date('2026-04-30T23:59:59Z'))).toBe(false);
    expect(isEnrollmentOpen(edition, new Date('2026-06-15T00:00:00Z'))).toBe(false);
  });

  it('treats a missing opening date as already open', () => {
    expect(
      isEnrollmentOpen({ ...edition, enrollmentOpensAt: null }, new Date('2020-01-01T00:00:00Z')),
    ).toBe(true);
  });
});

describe('pickNextEdition', () => {
  const base = {
    code: 'X',
    startsAt: '2026-06-20T12:00:00.000Z',
    endsAt: '2026-07-20T12:00:00.000Z',
    enrollmentOpensAt: null,
    enrollmentClosesAt: '2026-06-15T12:00:00.000Z',
    priceClp: 10_000,
    taxTreatment: 'exempt' as const,
    capacity: 10,
    freeForCommunity: false,
    schedule: null,
    location: null,
  };

  it('prefers an open edition with seats over earlier sold-out or closed ones', () => {
    const closed = { ...base, id: 'a', enrollmentOpen: false, availableSeats: 5 };
    const soldOut = { ...base, id: 'b', enrollmentOpen: true, availableSeats: 0 };
    const open = { ...base, id: 'c', enrollmentOpen: true, availableSeats: 3 };
    expect(pickNextEdition([closed, soldOut, open])?.id).toBe('c');
    expect(pickNextEdition([closed, soldOut])?.id).toBe('b');
    expect(pickNextEdition([closed])?.id).toBe('a');
    expect(pickNextEdition([])).toBeNull();
  });
});

describe('CatalogService', () => {
  it('lists courses with live seats and pagination metadata', async () => {
    const repository = new InMemoryCatalogRepository(
      [testCourse()],
      new Map([['edition-1', { taken: 25, reserved: 2 }]]),
    );
    const { service } = createService(repository);

    const result = await service.listCourses({ page: 1, pageSize: 12 });

    expect(result).toMatchObject({ page: 1, pageSize: 12, total: 1, totalPages: 1 });
    expect(result.items[0]?.nextEdition).toMatchObject({
      id: 'edition-1',
      availableSeats: 3,
      enrollmentOpen: true,
      startsAt: '2026-06-20T12:00:00.000Z',
    });
  });

  it('translates filters: text to tsquery and local dates to UTC boundaries', async () => {
    const { service, repository } = createService();
    await service.listCourses({
      q: 'Programación',
      area: 'tecnologias',
      modality: 'online',
      from: '2026-06-01',
      to: '2026-06-30',
      page: 2,
      pageSize: 10,
    });

    expect(repository.calls[0]).toEqual({
      method: 'searchCourses',
      args: [
        {
          tsQuery: 'programación:*',
          areaSlug: 'tecnologias',
          modality: 'online',
          startsFrom: new Date('2026-06-01T03:00:00.000Z'),
          startsBefore: new Date('2026-07-01T03:00:00.000Z'),
          offset: 10,
          limit: 10,
          now: TEST_NOW,
        },
      ],
    });
  });

  it('serves repeated reads from the cache but recomputes seats from their own cache', async () => {
    const { service, repository, cache } = createService();
    await service.getCourse('programacion-web');
    await service.getCourse('programacion-web');

    expect(repository.calls.filter((c) => c.method === 'findPublishedCourse')).toHaveLength(1);
    expect(repository.calls.filter((c) => c.method === 'seatUsage')).toHaveLength(1);

    // Al vencer la caché de cupos (simulado borrando la clave) se vuelven a consultar.
    await cache.delete(['catalog:v1:seats:edition-1']);
    repository.usage.set('edition-1', { taken: 30, reserved: 0 });
    const course = await service.getCourse('programacion-web');
    expect(course?.editions[0]?.availableSeats).toBe(0);
    expect(repository.calls.filter((c) => c.method === 'findPublishedCourse')).toHaveLength(1);
  });

  it('caches unknown slugs as null to avoid repeated database lookups', async () => {
    const { service, repository } = createService();
    expect(await service.getCourse('no-existe')).toBeNull();
    expect(await service.getCourse('no-existe')).toBeNull();
    expect(repository.calls.filter((c) => c.method === 'findPublishedCourse')).toHaveLength(1);
  });

  it('returns course details with every visible edition and the SEO overrides', async () => {
    const course = testCourse({
      seoTitle: 'Curso de JavaScript',
      editions: [
        testEdition(),
        testEdition({ id: 'edition-2', code: 'JS-2026-2', startsAt: new Date('2026-09-01') }),
      ],
    });
    const { service } = createService(new InMemoryCatalogRepository([course]), new NoCache());
    const detail = await service.getCourse('programacion-web');

    expect(detail?.editions.map((edition) => edition.code)).toEqual(['JS-2026-1', 'JS-2026-2']);
    expect(detail?.nextEdition?.code).toBe('JS-2026-1');
    expect(detail?.seoTitle).toBe('Curso de JavaScript');
    expect(detail?.updatedAt).toBe('2026-05-10T15:00:00.000Z');
  });

  it('only exposes areas that have published courses', async () => {
    const repository = new InMemoryCatalogRepository([], new Map(), [
      { slug: 'a', name: 'A', description: null, publishedCourses: 2 },
      { slug: 'b', name: 'B', description: null, publishedCourses: 0 },
    ]);
    const { service } = createService(repository);
    expect(await service.listAreas()).toEqual([
      { slug: 'a', name: 'A', description: null, courseCount: 2 },
    ]);
  });
});
