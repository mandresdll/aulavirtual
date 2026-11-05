import { formatDateTime, type Edition } from '@plataforma/shared';
import { Link, useLocation } from 'react-router';
import { ApiError } from '../lib/api';
import {
  useFreeEnrollment,
  useJoinWaitlist,
  useLeaveWaitlist,
  useMyEnrollments,
} from '../lib/enrollment';
import { useSession } from '../lib/session';
import { AddToCartButton } from './AddToCartButton';

const primary =
  'rounded-md bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60';
const secondary =
  'rounded-md border border-brand-700 px-4 py-2 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60';

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'No pudimos completar la acción.';
}

/**
 * Qué puede hacer la persona con una edición: comprar, inscribirse sin costo (RF-04) o entrar a
 * la lista de espera (RF-05). La API valida todo de nuevo; esto solo elige qué mostrar.
 */
export function EditionActions({ edition }: { edition: Edition }) {
  const session = useSession();
  const mine = useMyEnrollments();
  const free = useFreeEnrollment();
  const join = useJoinWaitlist();
  const leave = useLeaveWaitlist();
  const location = useLocation();

  const user = session.data?.authenticated ? session.data.user : null;
  if (mine.data?.enrolledEditionIds.includes(edition.id)) {
    return <p className="mt-3 font-medium text-green-800">Ya estás inscrito en esta edición.</p>;
  }
  if (!edition.enrollmentOpen) return null;

  const entry = mine.data?.waitlist.find((item) => item.editionId === edition.id);
  const offer = entry?.offerExpiresAt ?? null;
  const hasSeat = edition.availableSeats > 0 || offer !== null;
  const eligible =
    user !== null &&
    edition.freeForCommunity &&
    edition.communityProfiles.some((profile) => user.profiles.includes(profile));
  const label = `edición ${edition.code}`;
  const error = free.error ?? join.error ?? leave.error;

  return (
    <div className="mt-3 space-y-2">
      {offer && (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          Tienes un cupo retenido hasta el {formatDateTime(new Date(offer))}. Completa tu
          inscripción antes de esa fecha.
        </p>
      )}

      {hasSeat && eligible && (
        <button
          type="button"
          className={primary}
          disabled={free.isPending}
          aria-label={`Inscribirme sin costo en la ${label}`}
          onClick={() => free.mutate(edition.id)}
        >
          Inscribirme sin costo
        </button>
      )}
      {hasSeat && !eligible && <AddToCartButton edition={edition} held={offer !== null} />}

      {!hasSeat && !user && (
        <Link
          to={`/ingresar?${new URLSearchParams({ returnTo: location.pathname }).toString()}`}
          className="inline-block font-semibold text-brand-700 underline"
        >
          Ingresa para unirte a la lista de espera
        </Link>
      )}
      {!hasSeat && user && !entry && (
        <button
          type="button"
          className={secondary}
          disabled={join.isPending}
          aria-label={`Unirme a la lista de espera de la ${label}`}
          onClick={() => join.mutate(edition.id)}
        >
          Unirme a la lista de espera
        </button>
      )}
      {entry?.position && (
        <p role="status" className="text-sm">
          Estás en la lista de espera (lugar {entry.position}). Te avisaremos por correo si se
          libera un cupo.
        </p>
      )}
      {entry && (
        <button
          type="button"
          className="text-sm text-red-800 underline"
          disabled={leave.isPending}
          aria-label={`Salir de la lista de espera de la ${label}`}
          onClick={() => leave.mutate(edition.id)}
        >
          Salir de la lista de espera
        </button>
      )}

      {Boolean(error) && (
        <p role="alert" className="text-sm text-red-800">
          {errorText(error)}
        </p>
      )}
    </div>
  );
}
