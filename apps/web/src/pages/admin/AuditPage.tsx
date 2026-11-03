import { AuditQuerySchema, formatDateTime, type AuditLogEntry } from '@plataforma/shared';
import { useSearchParams } from 'react-router';
import { inputClass, secondaryButton, smallButton } from '../../components/admin/ui';
import { Pagination } from '../../components/Pagination';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAuditLog } from '../../lib/admin';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS as ENTITY_LABELS } from '../../lib/audit-labels';
import { useDocumentTitle } from '../../lib/use-document-title';

const FILTER_KEYS = ['from', 'to', 'action', 'entityType', 'entityId', 'actorId'] as const;

/** Registro de auditoría de solo lectura con filtros (RF-12). */
export function AuditPage() {
  useDocumentTitle('Auditoría · Administración');
  const [params, setParams] = useSearchParams();
  const parsed = AuditQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : AuditQuerySchema.parse({});
  const audit = useAuditLog(query);

  const filterBy = (key: (typeof FILTER_KEYS)[number], value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.delete('page');
    setParams(next);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Auditoría</h1>
      <p className="mt-1 text-ink-muted">
        Registro permanente de accesos y cambios. No se puede modificar ni borrar.
      </p>

      <form
        key={params.toString()}
        role="search"
        aria-label="Filtrar auditoría"
        className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const key of FILTER_KEYS) {
            const value = String(data.get(key) ?? '').trim();
            if (value) next.set(key, value);
          }
          setParams(next);
        }}
      >
        <div>
          <label htmlFor="audit-from" className="block text-sm font-medium">
            Desde
          </label>
          <input
            id="audit-from"
            name="from"
            type="date"
            defaultValue={query.from ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="block text-sm font-medium">
            Hasta
          </label>
          <input
            id="audit-to"
            name="to"
            type="date"
            defaultValue={query.to ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="audit-action" className="block text-sm font-medium">
            Acción
          </label>
          <select
            id="audit-action"
            name="action"
            defaultValue={query.action ?? ''}
            className={inputClass}
          >
            <option value="">Todas</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-entity" className="block text-sm font-medium">
            Tipo de registro
          </label>
          <select
            id="audit-entity"
            name="entityType"
            defaultValue={query.entityType ?? ''}
            className={inputClass}
          >
            <option value="">Todos</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="entityId" defaultValue={query.entityId ?? ''} />
        <input type="hidden" name="actorId" defaultValue={query.actorId ?? ''} />
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={secondaryButton}>
            Filtrar
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setParams(new URLSearchParams())}
          >
            Limpiar filtros
          </button>
          {(query.entityId || query.actorId) && (
            <span className="text-sm text-ink-muted">
              Filtrando por {query.actorId ? 'usuario' : 'registro'} específico.
            </span>
          )}
        </div>
      </form>

      <div className="mt-4">
        {audit.isPending && <LoadingMessage />}
        {audit.isError && <ErrorMessage error={audit.error} onRetry={() => void audit.refetch()} />}
        {audit.data && (
          <>
            <p role="status" className="mb-2 text-sm text-ink-muted">
              {audit.data.total === 1 ? '1 registro' : `${audit.data.total} registros`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Registro de auditoría</caption>
                <thead className="border-b border-gray-300">
                  <tr>
                    <th scope="col" className="py-2 pr-4">
                      Fecha
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Usuario
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Acción
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Registro
                    </th>
                    <th scope="col" className="py-2">
                      Detalle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.items.map((entry) => (
                    <AuditRow key={entry.id} entry={entry} onFilter={filterBy} />
                  ))}
                </tbody>
              </table>
            </div>
            {audit.data.items.length === 0 && (
              <p className="py-4 text-ink-muted">No hay registros con esos filtros.</p>
            )}
            <Pagination
              page={audit.data.page}
              totalPages={audit.data.totalPages}
              hrefFor={(page) => {
                const next = new URLSearchParams(params);
                if (page > 1) next.set('page', String(page));
                else next.delete('page');
                return `/admin/auditoria?${next.toString()}`;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function AuditRow({
  entry,
  onFilter,
}: {
  entry: AuditLogEntry;
  onFilter: (key: 'actorId' | 'entityId', value: string) => void;
}) {
  const hasDetail = entry.before != null || entry.after != null;
  return (
    <tr className="border-b border-gray-200 align-top">
      <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(new Date(entry.createdAt))}</td>
      <td className="py-2 pr-4">
        {entry.actorId ? (
          <button
            type="button"
            className="text-left text-brand-700 underline"
            onClick={() => onFilter('actorId', entry.actorId ?? '')}
          >
            {entry.actorName ?? entry.actorId}
            <span className="sr-only"> (ver sus acciones)</span>
          </button>
        ) : (
          'Sistema'
        )}
        {entry.actorRole && <span className="block text-xs text-ink-muted">{entry.actorRole}</span>}
      </td>
      <td className="py-2 pr-4">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
      <td className="py-2 pr-4">
        {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
        {entry.entityId && (
          <button
            type="button"
            className={`${smallButton} mt-1 block`}
            onClick={() => onFilter('entityId', entry.entityId ?? '')}
          >
            Historial
          </button>
        )}
      </td>
      <td className="py-2">
        {hasDetail ? (
          <details>
            <summary className="cursor-pointer text-brand-700 underline">Ver cambios</summary>
            <dl className="mt-2 grid gap-2 text-xs">
              {entry.before != null && (
                <div>
                  <dt className="font-semibold">Antes</dt>
                  <dd>
                    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-muted p-2">
                      {JSON.stringify(entry.before, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
              {entry.after != null && (
                <div>
                  <dt className="font-semibold">Después</dt>
                  <dd>
                    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-muted p-2">
                      {JSON.stringify(entry.after, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          </details>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
        {entry.ip && <span className="block text-xs text-ink-muted">IP {entry.ip}</span>}
      </td>
    </tr>
  );
}
