import {
  formatClp,
  formatDateTime,
  ORDER_STATUS_LABELS,
  SALES_DOCUMENT_LABELS,
} from '@plataforma/shared';
import { Link, useParams } from 'react-router';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useOrder } from '../lib/commerce';
import { useDocumentTitle } from '../lib/use-document-title';

/** Resultado del checkout: orden creada, a la espera del pago (Fase 4) o confirmada ($0). */
export function OrderPage() {
  const { number } = useParams();
  useDocumentTitle(number ? `Orden ${number}` : 'Orden');
  const order = useOrder(number);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {order.isPending && <LoadingMessage />}
      {order.isError && <ErrorMessage error={order.error} onRetry={() => void order.refetch()} />}
      {order.data && (
        <>
          <h1 className="text-2xl font-bold text-brand-800">
            {order.data.status === 'paid' ? 'Inscripción confirmada' : 'Orden creada'}
          </h1>
          <p className="mt-2">
            Número de orden: <strong>{order.data.number}</strong> ·{' '}
            {ORDER_STATUS_LABELS[order.data.status]}
          </p>

          {order.data.status === 'paid' && (
            <p
              role="status"
              className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-900"
            >
              Tu inscripción no requiere pago. Recibirás por correo el acceso al Aula Virtual.
            </p>
          )}
          {order.data.status === 'awaiting_payment' && order.data.expiresAt && (
            <p
              role="status"
              className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900"
            >
              Tus cupos están reservados hasta el{' '}
              <time dateTime={order.data.expiresAt}>
                {formatDateTime(new Date(order.data.expiresAt))}
              </time>
              . El pago en línea con la pasarela del CFT se habilita en la próxima etapa del
              proyecto.
            </p>
          )}

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
          </p>
          <Link to="/cursos" className="mt-6 inline-block font-semibold text-brand-700 underline">
            Seguir viendo cursos
          </Link>
        </>
      )}
    </div>
  );
}
