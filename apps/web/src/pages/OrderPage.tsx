import {
  formatClp,
  formatDateTime,
  ORDER_STATUS_LABELS,
  PAYMENT_RESULTS,
  SALES_DOCUMENT_LABELS,
  type OrderSummary,
  type PaymentResult,
} from '@plataforma/shared';
import { Link, useParams, useSearchParams } from 'react-router';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { ApiError } from '../lib/api';
import { goToGateway, useOrder, useStartPayment } from '../lib/commerce';
import { useDocumentTitle } from '../lib/use-document-title';

const RESULT_MESSAGES: Record<PaymentResult, { text: string; tone: 'ok' | 'warn' | 'bad' }> = {
  aprobado: { text: 'Tu pago fue aprobado. Te enviaremos el comprobante por correo.', tone: 'ok' },
  rechazado: {
    text: 'El pago fue rechazado y no se realizó ningún cobro. Puedes intentarlo nuevamente.',
    tone: 'bad',
  },
  abandonado: { text: 'El pago se canceló y no se realizó ningún cobro.', tone: 'warn' },
  vencido: {
    text: 'El plazo para pagar terminó, por lo que no se realizó ningún cobro.',
    tone: 'bad',
  },
  procesando: {
    text: 'Estamos confirmando tu pago con la pasarela. Esta página se actualizará sola.',
    tone: 'warn',
  },
  error: {
    text: 'No pudimos confirmar el pago. Si ves un cargo en tu cuenta, será reversado.',
    tone: 'bad',
  },
};

const TONES = {
  ok: 'border-green-200 bg-green-50 text-green-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  bad: 'border-red-200 bg-red-50 text-red-800',
};

function parseResult(value: string | null): PaymentResult | null {
  return PAYMENT_RESULTS.find((item) => item === value) ?? null;
}

/** Orden del comprador: pago, resultado al volver de la pasarela y comprobante (RF-03). */
export function OrderPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  useDocumentTitle(number ? `Orden ${number}` : 'Orden');
  const order = useOrder(number);
  const result = parseResult(params.get('pago'));
  // El resultado de la URL deja de valer cuando la confirmación ya terminó.
  const confirming = order.data?.payment?.status === 'confirming';
  const message = result === 'procesando' && !confirming ? null : result;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {order.isPending && <LoadingMessage />}
      {order.isError && <ErrorMessage error={order.error} onRetry={() => void order.refetch()} />}
      {order.data && (
        <>
          <h1 className="text-2xl font-bold text-brand-800">{title(order.data)}</h1>
          <p className="mt-2">
            Número de orden: <strong>{order.data.number}</strong> ·{' '}
            {ORDER_STATUS_LABELS[order.data.status]}
          </p>

          {message && (
            <p
              role={RESULT_MESSAGES[message].tone === 'bad' ? 'alert' : 'status'}
              className={`mt-4 rounded-md border p-4 ${TONES[RESULT_MESSAGES[message].tone]}`}
            >
              {RESULT_MESSAGES[message].text}
            </p>
          )}

          <PaymentPanel order={order.data} confirming={confirming} />

          <table className="mt-6 w-full text-left text-sm">
            <caption className="sr-only">Detalle de la orden</caption>
            <thead className="border-b border-gray-300">
              <tr>
                <th scope="col" className="py-2 pr-4">
                  Curso
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Precio
                </th>
                <th scope="col" className="py-2 pr-4 text-right">
                  Descuento
                </th>
                <th scope="col" className="py-2 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.data.lines.map((line) => (
                <tr key={line.editionId} className="border-b border-gray-200">
                  <td className="py-2 pr-4">
                    {line.courseTitle}
                    <span className="block text-xs text-ink-muted">Edición {line.editionCode}</span>
                  </td>
                  <td className="py-2 pr-4 text-right">{formatClp(line.unitPriceClp)}</td>
                  <td className="py-2 pr-4 text-right">{formatClp(line.discountClp)}</td>
                  <td className="py-2 text-right">{formatClp(line.totalClp)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} className="py-2 pr-4 text-right">
                  Total
                </th>
                <td className="py-2 text-right font-bold">{formatClp(order.data.totalClp)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-sm text-ink-muted">
            Documento: {SALES_DOCUMENT_LABELS[order.data.documentType]}
            {order.data.couponCode && ` · Cupón ${order.data.couponCode}`}
            {order.data.payment?.cardLast4 &&
              ` · Tarjeta terminada en ${order.data.payment.cardLast4}`}
          </p>
          <Link to="/cursos" className="mt-6 inline-block font-semibold text-brand-700 underline">
            Seguir viendo cursos
          </Link>
        </>
      )}
    </div>
  );
}

function title(order: OrderSummary): string {
  if (order.status === 'paid') {
    return order.totalClp === 0 ? 'Inscripción confirmada' : 'Compra confirmada';
  }
  return order.status === 'awaiting_payment' ? 'Orden creada' : 'Detalle de la orden';
}

function PaymentPanel({ order, confirming }: { order: OrderSummary; confirming: boolean }) {
  const start = useStartPayment(order.number);

  if (order.status === 'paid') {
    return (
      <div className="mt-4">
        <p className="rounded-md border border-green-200 bg-green-50 p-4 text-green-900">
          {order.totalClp === 0 ? 'Tu inscripción no requiere pago. ' : 'Tu pago está confirmado. '}
          Recibirás por correo el acceso al Aula Virtual.
        </p>
        <a
          href={`/api/orders/${order.number}/receipt`}
          className="mt-3 inline-block font-semibold text-brand-700 underline"
        >
          Descargar comprobante (PDF)
        </a>
      </div>
    );
  }

  if (order.status === 'failed' || order.status === 'cancelled') {
    return (
      <p className="mt-4 text-ink-muted">
        Esta orden ya no se puede pagar y sus cupos se liberaron.{' '}
        <Link to="/cursos" className="font-semibold text-brand-700 underline">
          Vuelve a elegir tus cursos
        </Link>
        .
      </p>
    );
  }

  if (order.status !== 'awaiting_payment') return null;
  return (
    <div className="mt-4 rounded-md border border-gray-200 p-4">
      {order.expiresAt && (
        <p>
          Tus cupos están reservados hasta el{' '}
          <time dateTime={order.expiresAt}>{formatDateTime(new Date(order.expiresAt))}</time>.
        </p>
      )}
      <button
        type="button"
        disabled={start.isPending || confirming}
        onClick={() => start.mutate(undefined, { onSuccess: goToGateway })}
        className="mt-3 rounded-md bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        Pagar {formatClp(order.totalClp)}
      </button>
      <p className="mt-2 text-sm text-ink-muted">
        Serás dirigido a la pasarela de pagos: tus datos de tarjeta no pasan por este sitio.
        {order.paymentAttemptsLeft === 1 && ' Te queda un intento de pago.'}
      </p>
      {start.isError && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {start.error instanceof ApiError
            ? start.error.message
            : 'No pudimos iniciar el pago. Intenta nuevamente.'}
        </p>
      )}
    </div>
  );
}
