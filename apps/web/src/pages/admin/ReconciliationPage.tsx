import {
  DISCREPANCY_KIND_LABELS,
  formatClp,
  formatDateTime,
  ResolveDiscrepancySchema,
  toLocalIsoDate,
  type Discrepancy,
} from '@plataforma/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Feedback,
  inputClass,
  primaryButton,
  secondaryButton,
  smallButton,
} from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useReconciliation, useResolveDiscrepancy, useRunReconciliation } from '../../lib/sales';
import { useDocumentTitle } from '../../lib/use-document-title';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Diferencias entre los pagos y la pasarela (RF-08). Solo se marcan: las resuelve una persona. */
export function ReconciliationPage() {
  useDocumentTitle('Conciliación · Administración');
  const overview = useReconciliation();
  const run = useRunReconciliation();
  const [day, setDay] = useState(() => toLocalIsoDate(new Date(Date.now() - DAY_MS)));
  const last = overview.data?.lastRun;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Conciliación</h1>
      <p className="mt-1 text-ink-muted">
        Cada mañana se comparan los pagos del día anterior con la pasarela. Ningún pago cambia solo:
        revisa cada diferencia y deja constancia de cómo se resolvió.
      </p>

      <form
        aria-label="Conciliar un día"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate(day);
        }}
      >
        <div>
          <label htmlFor="conciliar-dia" className="block text-sm font-medium">
            Día
          </label>
          <input
            id="conciliar-dia"
            type="date"
            required
            value={day}
            className={inputClass}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>
        <button type="submit" className={primaryButton} disabled={run.isPending}>
          Conciliar ahora
        </button>
      </form>
      <Feedback error={run.error} />

      <div className="mt-4">
        {overview.isPending && <LoadingMessage />}
        {overview.isError && <ErrorMessage error={overview.error} />}
        {last && (
          <p role="status" className="text-sm">
            Última conciliación: {last.day} ({formatDateTime(new Date(last.finishedAt))}).{' '}
            {last.checked} revisadas, {last.discrepancies} diferencias nuevas
            {last.failed > 0 && `, ${last.failed} sin poder consultar`}.
          </p>
        )}
        {overview.data &&
          (overview.data.items.length === 0 ? (
            <p className="mt-3 text-ink-muted">No hay diferencias por resolver.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {overview.data.items.map((item) => (
                <DiscrepancyRow key={item.id} item={item} />
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function DiscrepancyRow({ item }: { item: Discrepancy }) {
  const resolve = useResolveDiscrepancy();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="rounded border border-gray-200 p-3 text-sm">
      <p className="font-semibold">
        {DISCREPANCY_KIND_LABELS[item.kind]} ·{' '}
        <Link to={`/admin/ordenes?numero=${item.orderNumber}`} className="underline">
          {item.orderNumber}
        </Link>
      </p>
      <p className="text-ink-muted">
        {item.day} · {item.buyOrder} · plataforma: {item.localStatus},{' '}
        {formatClp(item.localAmountClp)} · pasarela: {item.gatewayStatus},{' '}
        {formatClp(item.gatewayAmountClp)}
      </p>
      {open ? (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          aria-label={`Resolver diferencia de ${item.orderNumber}`}
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = ResolveDiscrepancySchema.safeParse({ note });
            setError(parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Inválido'));
            if (parsed.success) resolve.mutate({ id: item.id, note: parsed.data.note });
          }}
        >
          <div className="min-w-60 flex-1">
            <label htmlFor={`nota-${item.id}`} className="block font-medium">
              Cómo se resolvió
            </label>
            <input
              id={`nota-${item.id}`}
              value={note}
              aria-invalid={error ? true : undefined}
              className={inputClass}
              onChange={(event) => setNote(event.target.value)}
            />
            {error && <p className="mt-1 text-red-800">{error}</p>}
          </div>
          <button type="submit" className={secondaryButton} disabled={resolve.isPending}>
            Guardar
          </button>
        </form>
      ) : (
        <button
          type="button"
          className={`${smallButton} mt-2`}
          aria-label={`Resolver diferencia de ${item.orderNumber}`}
          onClick={() => setOpen(true)}
        >
          Resolver
        </button>
      )}
      <Feedback error={resolve.error} />
    </li>
  );
}
