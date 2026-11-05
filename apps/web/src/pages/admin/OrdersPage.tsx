import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatClp,
  formatDateTime,
  ORDER_STATUS_LABELS,
  OrderNumberParamsSchema,
  PAYMENT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  RefundRequestSchema,
  type AdminOrder,
  type RefundRequest,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import type { z } from 'zod';
import {
  ConfirmDialog,
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminOrder, useRefundOrder } from '../../lib/admin';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Consulta de una orden y devoluciones (RF-03). El listado de ventas llega en la Fase 7. */
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
    </div>
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
