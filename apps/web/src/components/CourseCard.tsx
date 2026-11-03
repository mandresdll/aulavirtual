import { MODALITY_LABELS, formatDate, type CourseCard as CourseCardData } from '@plataforma/shared';
import { Link } from 'react-router';
import { priceLabel } from '../lib/catalog';
import { SeatsBadge } from './EditionStatus';

interface CourseCardProps {
  course: CourseCardData;
  /** Nivel del título según la jerarquía de la página donde se usa. */
  headingLevel?: 2 | 3;
}

/** Tarjeta de curso. Todo el recuadro es clicable, pero el enlace accesible es el título. */
export function CourseCard({ course, headingLevel = 3 }: CourseCardProps) {
  const Heading = `h${headingLevel}` as const;
  const edition = course.nextEdition;

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-brand-600 hover:shadow-md">
      {course.imageUrl ? (
        <img
          src={course.imageUrl}
          alt=""
          width={640}
          height={360}
          loading="lazy"
          decoding="async"
          className="aspect-video w-full bg-brand-50 object-cover"
        />
      ) : (
        <div aria-hidden="true" className="aspect-video w-full bg-brand-50" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm font-medium text-brand-700">{course.area.name}</p>
        <Heading className="text-lg font-semibold leading-snug text-ink">
          <Link
            to={`/cursos/${course.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus:outline-none"
          >
            {course.title}
          </Link>
        </Heading>
        <p className="line-clamp-3 text-sm text-ink-muted">{course.summary}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
          <li>{MODALITY_LABELS[course.modality]}</li>
          <li>{course.durationHours} horas</li>
        </ul>
        <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-3">
          {edition ? (
            <>
              <p className="text-sm">
                <span className="text-ink-muted">Inicio: </span>
                <time dateTime={edition.startsAt}>{formatDate(new Date(edition.startsAt))}</time>
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-lg font-bold text-ink">{priceLabel(edition)}</p>
                <SeatsBadge edition={edition} />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Sin ediciones programadas por ahora.</p>
          )}
        </div>
      </div>
    </article>
  );
}
