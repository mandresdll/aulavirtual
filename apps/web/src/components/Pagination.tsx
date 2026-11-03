import { Link } from 'react-router';
import { pageWindow } from '../lib/pagination';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** URL de cada página (conserva los filtros). */
  hrefFor: (page: number) => string;
}

const itemClass = 'inline-flex min-w-11 items-center justify-center rounded-md px-3 py-2 text-sm';

export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Paginación" className="mt-8 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        {page > 1 && (
          <li>
            <Link
              to={hrefFor(page - 1)}
              className={`${itemClass} text-brand-700 hover:bg-brand-50`}
            >
              Anterior
            </Link>
          </li>
        )}
        {pageWindow(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className={`${itemClass} text-ink-muted`}>
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                to={hrefFor(item)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Página ${item}`}
                className={`${itemClass} ${
                  item === page
                    ? 'bg-brand-700 font-semibold text-white'
                    : 'text-brand-700 hover:bg-brand-50'
                }`}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        {page < totalPages && (
          <li>
            <Link
              to={hrefFor(page + 1)}
              className={`${itemClass} text-brand-700 hover:bg-brand-50`}
            >
              Siguiente
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
