import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatClp,
  formatDateTime,
  ORDER_STATUS_LABELS,
  OrderNumberParamsSchema,
  ORDER_STATUSES,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  RefundRequestSchema,
  SALES_DOCUMENT_STATUS_LABELS,
  SALES_DOCUMENT_TYPE_LABELS,
  SalesQuerySchema,
  type AdminOrder,
  type RefundRequest,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import {
  ConfirmDialog,
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../../components/admin/ui';
import { Pagination } from '../../components/Pagination';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminOrder, useRefundOrder } from '../../lib/admin';
import { toQueryString, useSales } from '../../lib/sales';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Listado de ventas (RF-08), detalle de una orden y devoluciones (RF-03). */
export function OrdersPage() {
  useDocumentTitle('Órdenes · Administración');
  const [params, setParams] = useSearchParams();
  const raw = params.get('numero')?.trim().toUpperCase() ?? '';
  const valid = OrderNumberParamsSchema.safeParse({ number: raw }).success;
  const order = useAdminOrder(valid ? raw : undefined);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Órdenes</h1>
      <form
        role="search"
        aria-label="Buscar orden"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get('numero') ?? '').trim();
          setParams(value ? { numero: value } : {});
        }}
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="orden-numero" className="block text-sm font-medium">
            Número de orden
          </label>
          <input
            id="orden-numero"
            name="numero"
            defaultValue={raw}
            placeholder="UTA-2026-000123"
            className={inputClass}
          />
        </div>
        <button type="submit" className={secondaryButton}>
          Buscar
        </button>
      </form>

      <div className="mt-4">
        {raw && !valid && (
          <p role="alert" className="text-red-800">
            El número debe tener el formato UTA-2026-000123.
          </p>
        )}
        {valid && order.isPending && <LoadingMessage />}
        {order.isError && <ErrorMessage error={order.error} />}
        {order.data && <OrderDetail key={order.data.number} order={order.data} />}
      </div>
      {!raw && <SalesList />}
    </div>
  );
}

const SALES_FILTERS = ['from', 'to', 'status', 'q'] as const;

function SalesList() {
  const [params, setParams] = useSearchParams();
  const parsed = SalesQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : SalesQuerySchema.parse({});
  const sales = useSales(query);
  const filters = Object.fromEntries(SALES_FILTERS.map((key) => [key, query[key]]));

  return (
    <section aria-labelledby="ventas">
      <h2 id="ventas" className="text-lg font-semibold">
        Ventas
      </h2>
      <form
        key={params.toString()}
        role="search"
        aria-label="Filtrar ventas"
        className="mt-2 grid gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const key of SALES_FILTERS) {
            const value = String(data.get(key) ?? '').trim();
            if (value) next.set(key, value);
          }
          setParams(next);
        }}
      >
        <div>
          <label htmlFor="ventas-from" className="block text-sm font-medium">
            Desde
          </label>
          <input
            id="ventas-from"
            name="from"
            type="date"
            defaultValue={query.from ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ventas-to" className="block text-sm font-medium">
            Hasta
          </label>
          <input
            id="ventas-to"
            name="to"
            type="date"
            defaultValue={query.to ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ventas-status" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="ventas-status"
            name="status"
            defaultValue={query.status ?? ''}
            className={inputClass}
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ventas-q" className="block text-sm font-medium">
            Comprador u orden
          </label>
          <input id="ventas-q" name="q" defaultValue={query.q ?? ''} className={inputClass} />
        </div>
        <div className="self-end">
          <button type="submit" className={secondaryButton}>
            Filtrar
          </button>
        </div>
      </form>

      <p className="mt-2 flex flex-wrap gap-3 text-sm">
        <a
          className="underline"
          href={`/api/admin/sales/export?${toQueryString({ ...filters, format: 'xlsx' })}`}
        >
          Descargar en Excel
        </a>
        <a
          className="underline"
          href={`/api/admin/sales/export?${toQueryString({ ...filters, format: 'csv' })}`}
        >
          Descargar en CSV
        </a>
      </p>

      <div className="mt-3">
        {sales.isPending && <LoadingMessage />}
        {sales.isError && <ErrorMessage error={sales.error} />}
        {sales.data &&
          (sales.data.items.length === 0 ? (
            <p className="text-ink-muted">No hay ventas con estos filtros.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Ventas</caption>
                  <thead>
                    <tr className="border-b border-gray-300">
                      {[
                        'Orden',
                        'Fecha',
                        'Estado',
                        'Comprador',
                        'Total',
                        'Devuelto',
                        'Documento',
                      ].map((header) => (
                        <th key={header} scope="col" className="py-2 pr-3">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.data.items.map((sale) => (
                      <tr key={sale.number} className="border-b border-gray-200">
                        <th scope="row" className="py-2 pr-3 font-normal">
                          <Link to={`?numero=${sale.number}`} className="underline">
                            {sale.number}
                          </Link>
                        </th>
                        <td className="py-2 pr-3">{formatDateTime(new Date(sale.createdAt))}</td>
                        <td className="py-2 pr-3">{ORDER_STATUS_LABELS[sale.status]}</td>
                        <td className="py-2 pr-3">{sale.buyerName}</td>
                        <td className="py-2 pr-3">{formatClp(sale.totalClp)}</td>
                        <td className="py-2 pr-3">{formatClp(sale.refundedClp)}</td>
                        <td className="py-2">
                          {SALES_DOCUMENT_TYPE_LABELS[sale.documentType]}
                          {sale.documentStatus &&
                            ` · ${SALES_DOCUMENT_STATUS_LABELS[sale.documentStatus]}`}
                          {sale.folio && ` · folio ${sale.folio}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={sales.data.page}
                totalPages={sales.data.totalPages}
                hrefFor={(page) => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(page));
                  return `?${next.toString()}`;
                }}
              />
            </>
          ))}
      </div>
    </section>
  );
}

function OrderDetail({ order }: { order: AdminOrder }) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="orden-resumen">
        <h2 id="orden-resumen" className="text-lg font-semibold">
          Orden {order.number}
        </h2>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-muted">Estado</dt>
          <dd>{ORDER_STATUS_LABELS[order.status]}</dd>
          <dt className="text-ink-muted">Comprador</dt>
          <dd>
            {order.buyer.name} ({order.buyer.email})
          </dd>
          <dt className="text-ink-muted">Total</dt>
          <dd>{formatClp(order.totalClp)}</dd>
          <dt className="text-ink-muted">Cursos</dt>
          <dd>{order.lines.map((line) => line.courseTitle).join(', ')}</dd>
        </dl>
      </section>

      <section aria-labelledby="orden-pagos">
        <h2 id="orden-pagos" className="text-lg font-semibold">
          Pagos
        </h2>
        {order.payments.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">Sin intentos de pago.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {order.payments.map((payment) => (
              <li key={payment.buyOrder}>
                {payment.buyOrder} · {formatClp(payment.amountClp)} ·{' '}
                {PAYMENT_STATUS_LABELS[payment.status]}
                {payment.authorizationCode && ` · autorización ${payment.authorizationCode}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="orden-devoluciones">
        <h2 id="orden-devoluciones" className="text-lg font-semibold">
          Devoluciones
        </h2>
        {order.refunds.length > 0 && (
          <ul className="mt-1 space-y-1 text-sm">
            {order.refunds.map((refund) => (
              <li key={refund.id}>
                {formatDateTime(new Date(refund.createdAt))} · {formatClp(refund.amountClp)} ·{' '}
                {REFUND_STATUS_LABELS[refund.status]} · {refund.reason}
              </li>
            ))}
          </ul>
        )}
        {order.refundableClp > 0 ? (
          <RefundForm order={order} />
        ) : (
          order.refunds.length === 0 && (
            <p className="mt-1 text-sm text-ink-muted">Esta orden no tiene montos por devolver.</p>
          )
        )}
      </section>

      <section aria-labelledby="orden-historial">
        <h2 id="orden-historial" className="text-lg font-semibold">
          Historial
        </h2>
        <ol className="mt-1 space-y-1 text-sm">
          {order.history.map((change) => (
            <li key={`${change.toStatus}-${change.createdAt}`}>
              {formatDateTime(new Date(change.createdAt))} · {ORDER_STATUS_LABELS[change.toStatus]}
              {change.reason && ` · ${change.reason}`}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function RefundForm({ order }: { order: AdminOrder }) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const refund = useRefundOrder(order.number, key);
  const [pending, setPending] = useState<RefundRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof RefundRequestSchema>, unknown, RefundRequest>({
    resolver: zodResolver(RefundRequestSchema),
    defaultValues: { amountClp: order.refundableClp, reason: '' },
  });

  return (
    <form
      noValidate
      aria-label="Devolver"
      onSubmit={handleSubmit((input) => {
        setMessage(null);
        setPending(input);
      })}
      className="mt-2 grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2"
    >
      <Field
        label="Monto a devolver (CLP)"
        hint={`Disponible: ${formatClp(order.refundableClp)}. El total retira la inscripción.`}
        error={errors.amountClp}
      >
        {(props) => (
          <input
            {...props}
            type="number"
            min={1}
            max={order.refundableClp}
            className={inputClass}
            {...register('amountClp', { valueAsNumber: true })}
          />
        )}
      </Field>
      <Field label="Motivo" error={errors.reason}>
        {(props) => <input {...props} className={inputClass} {...register('reason')} />}
      </Field>
      <div className="sm:col-span-2">
        <Feedback error={refund.error} success={message} />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className={primaryButton} disabled={refund.isPending}>
          Devolver
        </button>
      </div>
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={`¿Devolver ${formatClp(pending.amountClp)}?`}
          description="La devolución se envía a la pasarela de pagos y no se puede deshacer."
          confirmLabel="Devolver"
          onConfirm={() =>
            refund.mutate(pending, {
              onSuccess: (updated) => {
                setMessage('Devolución realizada.');
                setKey(crypto.randomUUID());
                reset({ amountClp: updated.refundableClp, reason: '' });
              },
              onError: () => setKey(crypto.randomUUID()),
              onSettled: () => setPending(null),
            })
          }
        />
      )}
    </form>
  );
}
