import {
  AdminCourseListQuerySchema,
  COURSE_STATUS_LABELS,
  COURSE_STATUSES,
  formatDateTime,
} from '@plataforma/shared';
import { Link, useSearchParams } from 'react-router';
import {
  inputClass,
  primaryButton,
  ScrollRegion,
  secondaryButton,
  StatusBadge,
} from '../../components/admin/ui';
import { Pagination } from '../../components/Pagination';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminCourses } from '../../lib/admin';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Cursos en todos los estados (RF-07). Los filtros viven en la URL. */
export function CoursesPage() {
  useDocumentTitle('Cursos · Administración');
  const [params, setParams] = useSearchParams();
  const parsed = AdminCourseListQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : AdminCourseListQuerySchema.parse({});
  const courses = useAdminCourses(query);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Cursos</h1>
        <Link to="/admin/cursos/nuevo" className={primaryButton}>
          Nuevo curso
        </Link>
      </div>

      <form
        role="search"
        aria-label="Buscar cursos del panel"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const key of ['q', 'status'] as const) {
            const value = String(data.get(key) ?? '').trim();
            if (value) next.set(key, value);
          }
          setParams(next);
        }}
      >
        <div className="min-w-48 flex-1">
          <label htmlFor="admin-q" className="block text-sm font-medium">
            Buscar por título o slug
          </label>
          <input
            id="admin-q"
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="admin-status" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="admin-status"
            name="status"
            defaultValue={query.status ?? ''}
            className={inputClass}
          >
            <option value="">Todos</option>
            {COURSE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {COURSE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={secondaryButton}>
          Filtrar
        </button>
      </form>

      <div className="mt-4">
        {courses.isPending && <LoadingMessage />}
        {courses.isError && (
          <ErrorMessage error={courses.error} onRetry={() => void courses.refetch()} />
        )}
        {courses.data && (
          <>
            <p role="status" className="mb-2 text-sm text-ink-muted">
              {courses.data.total === 1 ? '1 curso' : `${courses.data.total} cursos`}
            </p>
            <ScrollRegion label="Tabla de cursos">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Cursos</caption>
                <thead className="border-b border-gray-300">
                  <tr>
                    <th scope="col" className="py-2 pr-4">
                      Curso
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Área
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Estado
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Ediciones
                    </th>
                    <th scope="col" className="py-2">
                      Actualizado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {courses.data.items.map((course) => (
                    <tr key={course.id} className="border-b border-gray-200">
                      <td className="py-2 pr-4">
                        <Link
                          to={`/admin/cursos/${course.id}`}
                          className="font-medium text-brand-700 underline"
                        >
                          {course.title}
                        </Link>
                        {course.featured && (
                          <span className="ml-2 text-xs text-ink-muted">(destacado)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{course.area.name}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge
                          status={course.status}
                          label={COURSE_STATUS_LABELS[course.status]}
                        />
                      </td>
                      <td className="py-2 pr-4">{course.editionCount}</td>
                      <td className="py-2 text-ink-muted">
                        {formatDateTime(new Date(course.updatedAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            {courses.data.items.length === 0 && (
              <p className="py-4 text-ink-muted">No hay cursos con esos filtros.</p>
            )}
            <Pagination
              page={courses.data.page}
              totalPages={courses.data.totalPages}
              hrefFor={(page) => {
                const next = new URLSearchParams(params);
                if (page > 1) next.set('page', String(page));
                else next.delete('page');
                return `/admin/cursos?${next.toString()}`;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
