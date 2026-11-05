import { Link } from 'react-router';
import { CourseCard } from '../components/CourseCard';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useAreas, useFeaturedCourses } from '../lib/catalog';
import { useSiteSettings } from '../lib/settings';
import { useDocumentTitle } from '../lib/use-document-title';

export function HomePage() {
  useDocumentTitle();
  const featured = useFeaturedCourses();
  const areas = useAreas();
  const { heroTitle, heroText } = useSiteSettings();

  return (
    <>
      <section className="bg-brand-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <h1 className="text-3xl font-bold text-brand-800 sm:text-4xl">{heroTitle}</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">{heroText}</p>
          <Link
            to="/cursos"
            className="mt-6 inline-block rounded-md bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-800"
          >
            Ver todos los cursos
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby="destacados">
        <h2 id="destacados" className="mb-6 text-2xl font-bold text-ink">
          Cursos destacados
        </h2>
        {featured.isPending ? (
          <LoadingMessage>Cargando cursos destacados…</LoadingMessage>
        ) : featured.isError ? (
          <ErrorMessage error={featured.error} onRetry={() => void featured.refetch()} />
        ) : featured.data.items.length === 0 ? (
          <p className="text-ink-muted">
            Pronto publicaremos nuevos cursos.{' '}
            <Link to="/cursos" className="font-medium text-brand-700 underline">
              Revisa el catálogo completo
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.items.map((course) => (
              <li key={course.slug}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {areas.isSuccess && areas.data.items.length > 0 && (
        <section className="bg-surface-muted" aria-labelledby="areas">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 id="areas" className="mb-6 text-2xl font-bold text-ink">
              Explora por área
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {areas.data.items.map((area) => (
                <li key={area.slug}>
                  <Link
                    to={`/cursos?area=${area.slug}`}
                    className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-600"
                  >
                    <span className="block font-semibold text-brand-800">{area.name}</span>
                    {area.description && (
                      <span className="mt-1 block text-sm text-ink-muted">{area.description}</span>
                    )}
                    <span className="mt-2 block text-sm text-ink-muted">
                      {area.courseCount === 1 ? '1 curso' : `${area.courseCount} cursos`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
