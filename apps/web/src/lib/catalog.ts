import {
  AreasResponseSchema,
  CourseDetailSchema,
  CourseListQuerySchema,
  CourseListResponseSchema,
  FeaturedCoursesResponseSchema,
  formatClp,
  type CourseListQuery,
  type Edition,
} from '@plataforma/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

/** Filtros que viven en la URL de `/cursos` (enlaces compartibles, botón atrás). */
export const FILTER_KEYS = ['q', 'area', 'modality', 'from', 'to'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type CatalogFilters = Partial<Record<FilterKey, string>>;

/** Lee los filtros de la URL. Los valores inválidos se descartan en vez de romper la página. */
export function filtersFromSearchParams(params: URLSearchParams): CourseListQuery {
  const raw: Record<string, string> = {};
  for (const key of [...FILTER_KEYS, 'page'] as const) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  const parsed = CourseListQuerySchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Se conserva solo lo válido campo por campo.
  const valid: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (CourseListQuerySchema.safeParse({ [key]: value }).success) valid[key] = value;
  }
  return CourseListQuerySchema.parse(valid);
}

export function searchParamsFromFilters(filters: CatalogFilters, page = 1): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  return params;
}

function toApiQuery(query: CourseListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useCourses(query: CourseListQuery) {
  return useQuery({
    queryKey: ['catalog', 'courses', query],
    queryFn: () => apiFetch(`/api/catalog/courses?${toApiQuery(query)}`, CourseListResponseSchema),
    placeholderData: keepPreviousData,
  });
}

export function useFeaturedCourses() {
  return useQuery({
    queryKey: ['catalog', 'featured'],
    queryFn: () => apiFetch('/api/catalog/courses/featured', FeaturedCoursesResponseSchema),
  });
}

export function useCourse(slug: string) {
  return useQuery({
    queryKey: ['catalog', 'course', slug],
    queryFn: () => apiFetch(`/api/catalog/courses/${encodeURIComponent(slug)}`, CourseDetailSchema),
    retry: false,
  });
}

export function useAreas() {
  return useQuery({
    queryKey: ['catalog', 'areas'],
    queryFn: () => apiFetch('/api/catalog/areas', AreasResponseSchema),
    staleTime: 5 * 60_000,
  });
}

export type EditionAvailability = 'open' | 'last_seats' | 'sold_out' | 'closed' | 'upcoming';

const LAST_SEATS_THRESHOLD = 5;

/** Estado visible de una edición: si se puede inscribir, si quedan pocos cupos, etc. */
export function editionAvailability(edition: Edition, now = new Date()): EditionAvailability {
  if (!edition.enrollmentOpen) {
    return edition.enrollmentOpensAt && now < new Date(edition.enrollmentOpensAt)
      ? 'upcoming'
      : 'closed';
  }
  if (edition.availableSeats === 0) return 'sold_out';
  return edition.availableSeats <= LAST_SEATS_THRESHOLD ? 'last_seats' : 'open';
}

/** Precio visible: "Gratuito" o el monto en CLP. */
export function priceLabel(edition: Pick<Edition, 'priceClp'>): string {
  return edition.priceClp === 0 ? 'Gratuito' : formatClp(edition.priceClp);
}
