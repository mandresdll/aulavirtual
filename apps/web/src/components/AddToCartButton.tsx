import type { Edition } from '@plataforma/shared';
import { Link } from 'react-router';
import { ApiError } from '../lib/api';
import { useCart, useCartActions } from '../lib/cart';

/**
 * Agregar una edición al carrito (RF-03): si tiene inscripciones abiertas y cupos, o si la lista
 * de espera le retiene un cupo a esta persona (`held`).
 */
export function AddToCartButton({ edition, held = false }: { edition: Edition; held?: boolean }) {
  const cart = useCart();
  const { add } = useCartActions();

  if (!edition.enrollmentOpen || (edition.availableSeats === 0 && !held)) return null;

  const inCart = cart.data?.items.some((item) => item.editionId === edition.id) ?? false;
  if (inCart) {
    return (
      <p className="mt-3 text-sm">
        Está en tu carrito.{' '}
        <Link to="/carrito" className="font-semibold text-brand-700 underline">
          Ver carrito
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => add.mutate(edition.id)}
        disabled={add.isPending}
        aria-label={`Agregar al carrito la edición ${edition.code}`}
        className="rounded-md bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        Agregar al carrito
      </button>
      {add.isError && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {add.error instanceof ApiError
            ? add.error.message
            : 'No pudimos agregar el curso. Intenta nuevamente.'}
        </p>
      )}
    </div>
  );
}
