import type { Edition } from '@plataforma/shared';
import { editionAvailability } from '../lib/catalog';

const STATUS_STYLES = {
  open: 'bg-green-50 text-green-800 ring-green-200',
  last_seats: 'bg-amber-50 text-amber-900 ring-amber-200',
  sold_out: 'bg-red-50 text-red-800 ring-red-200',
  closed: 'bg-surface-muted text-ink-muted ring-gray-200',
  upcoming: 'bg-blue-50 text-blue-800 ring-blue-200',
} as const;

function seatsLabel(edition: Edition): string {
  switch (editionAvailability(edition)) {
    case 'open':
      return `${edition.availableSeats} cupos disponibles`;
    case 'last_seats':
      return edition.availableSeats === 1
        ? '¡Queda 1 cupo!'
        : `¡Quedan ${edition.availableSeats} cupos!`;
    case 'sold_out':
      return 'Sin cupos disponibles';
    case 'closed':
      return 'Inscripciones cerradas';
    case 'upcoming':
      return 'Inscripciones próximamente';
  }
}

/** Cupos o estado de inscripción con texto (el color nunca es la única señal). */
export function SeatsBadge({ edition }: { edition: Edition }) {
  const status = editionAvailability(edition);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {seatsLabel(edition)}
    </span>
  );
}
