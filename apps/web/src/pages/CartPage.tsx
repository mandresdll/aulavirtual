import { formatClp, formatDate, TAX_TREATMENT_LABELS } from '@plataforma/shared';
import { Link } from 'react-router';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { ApiError } from '../lib/api';
import { useCart, useCartActions } from '../lib/cart';
import { useDocumentTitle } from '../lib/use-document-title';

/** Carrito de compras (RF-03): disponible sin sesión; para pagar se pide ingresar. */
export function CartPage() {
  useDocumentTitle('Carrito');
  const cart = useCart();
  const { remove } = useCartActions();

  const items = cart.data?.items ?? [];
  const available = items.filter((item) => item.unavailableReason === null);
  const blocked = items.length - available.length;
  const checkoutPath = '/checkout';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-800">Carrito</h1>

      {cart.isPending && <LoadingMessage />}
      {cart.isError && <ErrorMessage error={cart.error} onRetry={() => void cart.refetch()} />}

      {cart.data && items.length === 0 && (
        <div className="mt-6">
          <p className="text-ink-muted">Tu carrito está vacío.</p>
          <Link to="/cursos" className="mt-4 inline-block font-semibold text-brand-700 underline">
            Ver cursos disponibles
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <>
          <ul className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {items.map((item) => (
              <li
                key={item.editionId}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div>
                  <Link
                    to={`/cursos/${item.courseSlug}`}
                    className="font-semibold text-brand-700 underline"
                  >
                    {item.courseTitle}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    Edición {item.editionCode} · inicio{' '}
                    <time dateTime={item.startsAt}>{formatDate(new Date(item.startsAt))}</time>
                  </p>
                  {item.unavailableReason && (
                    <p className="mt-1 text-sm font-medium text-red-800">
                      {item.unavailableReason}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold">
                    {item.priceClp === 0 ? 'Gratuito' : formatClp(item.priceClp)}
                  </p>
                  {item.priceClp > 0 && (
                    <p className="text-xs text-ink-muted">
                      {TAX_TREATMENT_LABELS[item.taxTreatment]}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => remove.mutate(item.editionId)}
                    disabled={remove.isPending}
                    aria-label={`Quitar ${item.courseTitle} (${item.editionCode}) del carrito`}
                    className="mt-2 text-sm text-red-800 underline"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {remove.isError && (
            <p role="alert" className="mt-3 text-red-800">
              {remove.error instanceof ApiError
                ? remove.error.message
                : 'No pudimos quitar el curso. Intenta nuevamente.'}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-lg">
              Total: <strong>{formatClp(cart.data?.subtotalClp ?? 0)}</strong>
              <span className="block text-sm text-ink-muted">
                Precio final con impuestos incluidos. Los cupones se aplican al pagar.
              </span>
            </p>
            {available.length > 0 && blocked === 0 ? (
              <Link
                to={
                  cart.authenticated
                    ? checkoutPath
                    : `/ingresar?${new URLSearchParams({ returnTo: checkoutPath }).toString()}`
                }
                className="rounded-md bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-800"
              >
                {cart.authenticated ? 'Continuar al pago' : 'Ingresar para comprar'}
              </Link>
            ) : (
              <p role="status" className="text-sm text-red-800">
                Quita los cursos que ya no se pueden comprar para continuar.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
