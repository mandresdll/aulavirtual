import { ENROLLMENT_SOURCE_LABELS, formatDateTime, type AdminEnrollment } from '@plataforma/shared';
import { Feedback, ScrollRegion, smallButton } from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminEnrollments, useAdminWaitlist, useRetryEnrollment } from '../../lib/enrollment';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Matrículas con problemas y listas de espera (RF-05). */
export function EnrollmentsPage() {
  useDocumentTitle('Inscripciones · Administración');
  const failed = useAdminEnrollments('failed');
  const pending = useAdminEnrollments('pending_lms');
  const waitlist = useAdminWaitlist();
  const retry = useRetryEnrollment();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-brand-800">Inscripciones</h1>

      <section aria-labelledby="inscripciones-fallidas">
        <h2 id="inscripciones-fallidas" className="text-lg font-semibold">
          Matrículas fallidas
        </h2>
        <div className="mt-2 space-y-2">
          <Feedback error={retry.error} />
          {failed.isPending && <LoadingMessage />}
          {failed.isError && <ErrorMessage error={failed.error} />}
          {failed.data?.items.length === 0 && (
            <p className="text-ink-muted">No hay matrículas fallidas.</p>
          )}
          {failed.data && failed.data.items.length > 0 && (
            <EnrollmentTable
              caption="Matrículas fallidas"
              items={failed.data.items}
              onRetry={(id) => retry.mutate(id)}
              pending={retry.isPending}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="inscripciones-pendientes">
        <h2 id="inscripciones-pendientes" className="text-lg font-semibold">
          Matrículas en proceso
        </h2>
        <div className="mt-2">
          {pending.isError && <ErrorMessage error={pending.error} />}
          {pending.data?.items.length === 0 && (
            <p className="text-ink-muted">No hay matrículas en proceso.</p>
          )}
          {pending.data && pending.data.items.length > 0 && (
            <EnrollmentTable caption="Matrículas en proceso" items={pending.data.items} />
          )}
        </div>
      </section>

      <section aria-labelledby="lista-espera">
        <h2 id="lista-espera" className="text-lg font-semibold">
          Listas de espera
        </h2>
        <div className="mt-2">
          {waitlist.isError && <ErrorMessage error={waitlist.error} />}
          {waitlist.data?.items.length === 0 && (
            <p className="text-ink-muted">No hay personas en listas de espera.</p>
          )}
          {waitlist.data && waitlist.data.items.length > 0 && (
            <ScrollRegion label="Tabla de lista de espera">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Listas de espera</caption>
                <thead className="border-b border-gray-300">
                  <tr>
                    <th scope="col" className="py-2 pr-4">
                      Edición
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Lugar
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Persona
                    </th>
                    <th scope="col" className="py-2">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.data.items.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-200">
                      <td className="py-2 pr-4">
                        {entry.courseTitle}
                        <span className="block text-xs text-ink-muted">{entry.editionCode}</span>
                      </td>
                      <td className="py-2 pr-4">{entry.position}</td>
                      <td className="py-2 pr-4">
                        {entry.user.name}
                        <span className="block text-xs text-ink-muted">{entry.user.email}</span>
                      </td>
                      <td className="py-2">
                        {entry.offerExpiresAt
                          ? `Cupo retenido hasta el ${formatDateTime(new Date(entry.offerExpiresAt))}`
                          : 'En espera'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
        </div>
      </section>
    </div>
  );
}

function EnrollmentTable({
  caption,
  items,
  onRetry,
  pending = false,
}: {
  caption: string;
  items: AdminEnrollment[];
  onRetry?: (id: string) => void;
  pending?: boolean;
}) {
  return (
    <ScrollRegion label="Tabla de matrículas fallidas">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-gray-300">
          <tr>
            <th scope="col" className="py-2 pr-4">
              Persona
            </th>
            <th scope="col" className="py-2 pr-4">
              Edición
            </th>
            <th scope="col" className="py-2 pr-4">
              Origen
            </th>
            <th scope="col" className="py-2 pr-4">
              Intentos
            </th>
            <th scope="col" className="py-2">
              {onRetry ? 'Error' : 'Último error'}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-200 align-top">
              <td className="py-2 pr-4">
                {item.user.name}
                <span className="block text-xs text-ink-muted">{item.user.email}</span>
              </td>
              <td className="py-2 pr-4">
                {item.courseTitle}
                <span className="block text-xs text-ink-muted">{item.editionCode}</span>
              </td>
              <td className="py-2 pr-4">{ENROLLMENT_SOURCE_LABELS[item.source]}</td>
              <td className="py-2 pr-4">{item.attempts}</td>
              <td className="py-2">
                {item.lastError ?? '—'}
                {onRetry && (
                  <button
                    type="button"
                    className={`${smallButton} mt-1 block`}
                    disabled={pending}
                    aria-label={`Reintentar matrícula de ${item.user.name}`}
                    onClick={() => onRetry(item.id)}
                  >
                    Reintentar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
