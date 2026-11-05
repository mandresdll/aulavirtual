import { ENROLLMENT_STATUS_LABELS, formatDate } from '@plataforma/shared';
import { Link, Navigate, useLocation } from 'react-router';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useMyCourses } from '../lib/certificates';
import { useSession } from '../lib/session';
import { useDocumentTitle } from '../lib/use-document-title';

/** Cursos del usuario con su estado, acceso al Aula Virtual y certificado (RF-06). */
export function MyCoursesPage() {
  useDocumentTitle('Mis cursos');
  const session = useSession();
  const location = useLocation();
  const courses = useMyCourses();

  if (session.isPending) return <LoadingMessage />;
  if (session.data && !session.data.authenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/ingresar?${new URLSearchParams({ returnTo }).toString()}`} replace />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-800">Mis cursos</h1>
      <div className="mt-4">
        {courses.isPending && <LoadingMessage />}
        {courses.isError && (
          <ErrorMessage error={courses.error} onRetry={() => void courses.refetch()} />
        )}
        {courses.data?.items.length === 0 && (
          <p className="text-ink-muted">
            Aún no tienes cursos.{' '}
            <Link to="/cursos" className="text-brand-700 underline">
              Revisa el catálogo
            </Link>
            .
          </p>
        )}
        {courses.data && courses.data.items.length > 0 && (
          <ul className="space-y-3">
            {courses.data.items.map((course) => (
              <li key={course.editionId} className="rounded-lg border border-gray-200 p-4">
                <h2 className="font-semibold">
                  <Link to={`/cursos/${course.courseSlug}`} className="text-brand-700 underline">
                    {course.courseTitle}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {course.editionCode} · {formatDate(new Date(course.startsAt))} al{' '}
                  {formatDate(new Date(course.endsAt))}
                </p>
                <p className="mt-1 text-sm">
                  Estado: <strong>{ENROLLMENT_STATUS_LABELS[course.status]}</strong>
                </p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  {course.status === 'enrolled' && courses.data.lmsUrl && (
                    <a
                      href={courses.data.lmsUrl}
                      className="font-semibold text-brand-700 underline"
                    >
                      Ir al Aula Virtual
                    </a>
                  )}
                  {course.certificateCode && (
                    <>
                      <a
                        href={`/api/my/certificates/${course.certificateCode}/pdf`}
                        className="font-semibold text-brand-700 underline"
                      >
                        Descargar certificado (PDF)
                      </a>
                      <Link
                        to={`/verificar/${course.certificateCode}`}
                        className="font-semibold text-brand-700 underline"
                      >
                        Ver verificación
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
