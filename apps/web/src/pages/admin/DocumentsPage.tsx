import {
  DocumentsQuerySchema,
  formatClp,
  formatDate,
  RegisterFolioSchema,
  SALES_DOCUMENT_STATUS_LABELS,
  SALES_DOCUMENT_STATUSES,
  SALES_DOCUMENT_TYPE_LABELS,
  toLocalIsoDate,
  type AdminDocument,
  type ExportFormat,
} from '@plataforma/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Feedback, inputClass, secondaryButton, smallButton } from '../../components/admin/ui';
import { Pagination } from '../../components/Pagination';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import {
  useDocuments,
  useExportDocuments,
  useRegisterFolio,
  useRetryDocument,
} from '../../lib/sales';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Boletas y facturas: archivo contable, folios y errores de emisión (RF-08). */
export function DocumentsPage() {
  useDocumentTitle('Documentos · Administración');
  const [params, setParams] = useSearchParams();
  const parsed = DocumentsQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : DocumentsQuerySchema.parse({});
  const documents = useDocuments(query);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Documentos</h1>
      <p className="mt-1 text-ink-muted">
        Boletas y facturas de las órdenes pagadas. Una devolución no anula el documento: la nota de
        crédito se gestiona en el sistema de emisión.
      </p>

      <form
        key={params.toString()}
        role="search"
        aria-label="Filtrar documentos"
        className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const key of ['from', 'to', 'status']) {
            const value = String(data.get(key) ?? '');
            if (value) next.set(key, value);
          }
          setParams(next);
        }}
      >
        <div>
          <label htmlFor="doc-from" className="block text-sm font-medium">
            Pagadas desde
          </label>
          <input
            id="doc-from"
            name="from"
            type="date"
            defaultValue={query.from ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="doc-to" className="block text-sm font-medium">
            Hasta
          </label>
          <input
            id="doc-to"
            name="to"
            type="date"
            defaultValue={query.to ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="doc-status" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="doc-status"
            name="status"
            defaultValue={query.status ?? ''}
            className={inputClass}
          >
            <option value="">Todos</option>
            {SALES_DOCUMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SALES_DOCUMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="self-end">
          <button type="submit" className={secondaryButton}>
            Filtrar
          </button>
        </div>
      </form>

      <ExportForm from={query.from} to={query.to} />

      <div className="mt-4">
        {documents.isPending && <LoadingMessage />}
        {documents.isError && <ErrorMessage error={documents.error} />}
        {documents.data &&
          (documents.data.items.length === 0 ? (
            <p className="text-ink-muted">No hay documentos con estos filtros.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {documents.data.items.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    byFile={documents.data.deliveredByFile}
                  />
                ))}
              </ul>
              <Pagination
                page={documents.data.page}
                totalPages={documents.data.totalPages}
                hrefFor={(page) => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page));
                  return `?${next.toString()}`;
                }}
              />
            </>
          ))}
      </div>
    </div>
  );
}

function ExportForm({ from, to }: { from: string | undefined; to: string | undefined }) {
  const today = toLocalIsoDate(new Date());
  const exportFile = useExportDocuments();
  const run = (format: ExportFormat) =>
    exportFile.mutate({ format, from: from ?? `${today.slice(0, 8)}01`, to: to ?? today });

  return (
    <section aria-labelledby="archivo" className="mt-4">
      <h2 id="archivo" className="text-lg font-semibold">
        Archivo contable
      </h2>
      <p className="text-sm text-ink-muted">
        Incluye las órdenes pagadas entre {from ?? `${today.slice(0, 8)}01`} y {to ?? today}. Usa el
        filtro de fechas para cambiar el período.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={exportFile.isPending}
          onClick={() => run('xlsx')}
        >
          Descargar Excel
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={exportFile.isPending}
          onClick={() => run('csv')}
        >
          Descargar CSV
        </button>
      </div>
      <Feedback error={exportFile.error} />
    </section>
  );
}

function DocumentRow({ document, byFile }: { document: AdminDocument; byFile: boolean }) {
  const folio = useRegisterFolio();
  const retry = useRetryDocument();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const canRegister = byFile && document.folio === null;

  return (
    <li className="rounded border border-gray-200 p-3 text-sm">
      <p className="font-semibold">
        {SALES_DOCUMENT_TYPE_LABELS[document.type]} · {document.orderNumber} ·{' '}
        {formatClp(document.totalClp)}
      </p>
      <p className="text-ink-muted">
        {document.receiverName}
        {document.paidAt && ` · ${formatDate(new Date(document.paidAt))}`} ·{' '}
        {SALES_DOCUMENT_STATUS_LABELS[document.status]}
        {document.folio && ` · folio ${document.folio}`}
        {document.refundedClp > 0 && ` · devuelto ${formatClp(document.refundedClp)}`}
      </p>
      {document.lastError && <p className="text-red-800">{document.lastError}</p>}
      {canRegister && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          aria-label={`Registrar folio de ${document.orderNumber}`}
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = RegisterFolioSchema.safeParse({ folio: value });
            setInvalid(!parsed.success);
            if (parsed.success) folio.mutate({ id: document.id, ...parsed.data });
          }}
        >
          <div>
            <label htmlFor={`folio-${document.id}`} className="block font-medium">
              Folio
            </label>
            <input
              id={`folio-${document.id}`}
              value={value}
              aria-invalid={invalid || undefined}
              className={inputClass}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <button type="submit" className={smallButton} disabled={folio.isPending}>
            Registrar
          </button>
        </form>
      )}
      {document.status === 'failed' && (
        <button
          type="button"
          className={`${smallButton} mt-2`}
          disabled={retry.isPending}
          aria-label={`Reintentar documento de ${document.orderNumber}`}
          onClick={() => retry.mutate(document.id)}
        >
          Reintentar
        </button>
      )}
      <Feedback error={folio.error ?? retry.error} />
    </li>
  );
}
