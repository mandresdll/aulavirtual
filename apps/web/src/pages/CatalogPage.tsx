import { useNavigate, useSearchParams } from 'react-router';
import { CourseCard } from '../components/CourseCard';
import { CourseFilters } from '../components/CourseFilters';
import { Pagination } from '../components/Pagination';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import {
  FILTER_KEYS,
  filtersFromSearchParams,
  searchParamsFromFilters,
  useAreas,
  useCourses,
  type CatalogFilters,
} from '../lib/catalog';
import { useDocumentTitle } from '../lib/use-document-title';

function resultsLabel(total: number): string {
  if (total === 0) return 'No encontramos cursos con esos filtros.';
  return total === 1 ? '1 curso encontrado' : `${total} cursos encontrados`;
}

/** Listado público del catálogo (RF-01). Los filtros viven en la URL. */
export function CatalogPage() {
  useDocumentTitle('Catálogo de cursos');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = filtersFromSearchParams(searchParams);
  const courses = useCourses(query);
  const areas = useAreas();

  const filters: CatalogFilters = Object.fromEntries(
    FILTER_KEYS.flatMap((key) => (query[key] ? [[key, query[key]]] : [])),
  );
  const hrefFor = (page: number) => {
    const params = searchParamsFromFilters(filters, page).toString();
    return params ? `/cursos?${params}` : '/cursos';
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-brand-800">Catálogo de cursos</h1>
      <p className="mt-2 text-ink-muted">
        Busca por tema y filtra por área, modalidad o fecha de inicio.
      </p>

      <div className="mt-6">
        <CourseFilters
          // Se vuelve a montar al cambiar la URL (atrás/adelante) para mostrar sus filtros.
          key={searchParams.toString()}
          defaultValues={filters}
          areas={areas.data?.items ?? []}
          onSubmit={(values) => {
            const params = searchParamsFromFilters(values).toString();
            void navigate(params ? `/cursos?${params}` : '/cursos');
          }}
          onClear={() => void navigate('/cursos')}
        />
      </div>

      <section aria-labelledby="resultados" className="mt-8">
        <h2 id="resultados" className="sr-only">
          Resultados
        </h2>
        {courses.isPending ? (
          <LoadingMessage>Buscando cursos…</LoadingMessage>
        ) : courses.isError ? (
          <ErrorMessage error={courses.error} onRetry={() => void courses.refetch()} />
        ) : (
          <>
            <p role="status" className="mb-4 font-medium text-ink">
              {resultsLabel(courses.data.total)}
            </p>
            {courses.data.items.length > 0 && (
              <ul
                className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${
                  courses.isPlaceholderData ? 'opacity-60' : ''
                }`}
                aria-busy={courses.isPlaceholderData}
              >
                {courses.data.items.map((course) => (
                  <li key={course.slug}>
                    <CourseCard course={course} />
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              page={courses.data.page}
              totalPages={courses.data.totalPages}
              hrefFor={hrefFor}
            />
          </>
        )}
      </section>
    </div>
  );
}
