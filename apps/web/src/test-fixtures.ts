import type { CourseCard, CourseDetail, Edition } from '@plataforma/shared';
import { vi } from 'vitest';

/** Datos de prueba que cumplen los esquemas compartidos de la API del catálogo. */

export function edition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 'edition-1',
    code: 'JS-2026-1',
    startsAt: '2026-06-20T12:00:00.000Z',
    endsAt: '2026-07-31T12:00:00.000Z',
    enrollmentOpensAt: '2026-01-01T12:00:00.000Z',
    enrollmentClosesAt: '2099-06-15T23:00:00.000Z',
    priceClp: 89_000,
    taxTreatment: 'exempt',
    capacity: 30,
    availableSeats: 12,
    enrollmentOpen: true,
    freeForCommunity: false,
    schedule: 'Martes de 19:00 a 20:30',
    location: null,
    ...overrides,
  };
}

export function courseCard(overrides: Partial<CourseCard> = {}): CourseCard {
  return {
    slug: 'programacion-web-con-javascript',
    title: 'Programación web con JavaScript',
    summary: 'Aprende a crear sitios web.',
    modality: 'online',
    durationHours: 40,
    area: { slug: 'ti', name: 'Tecnologías' },
    imageUrl: '/img/cursos/programacion-web-con-javascript.svg',
    imageAlt: 'Código',
    featured: true,
    nextEdition: edition(),
    ...overrides,
  };
}

export function courseDetail(overrides: Partial<CourseDetail> = {}): CourseDetail {
  const editions = overrides.editions ?? [
    edition(),
    edition({ id: 'edition-2', code: 'JS-2026-2', availableSeats: 2 }),
  ];
  return {
    ...courseCard(),
    description: 'Curso práctico.',
    objectives: ['Construir páginas web accesibles'],
    contents: ['HTML', 'CSS'],
    requirements: 'Computador con internet',
    certificationInfo: 'Certificado verificable',
    instructors: [{ name: 'Camila Vidal Soto', title: 'Ingeniera', bio: null }],
    updatedAt: '2026-05-10T15:00:00.000Z',
    nextEdition: editions[0] ?? null,
    ...overrides,
    editions,
  };
}

/**
 * Simula la API: responde según la ruta (sin query string). Rutas no registradas → 404 con
 * el formato de error de la API.
 */
export function mockApi(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    const body = routes[url.pathname];
    if (body === undefined) {
      return new Response(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'El curso no existe o no está disponible.' },
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}
