import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 ${
    isActive ? 'bg-brand-800 underline underline-offset-4' : ''
  }`;

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const firstRender = useRef(true);

  // Al cambiar de ruta, el foco va al contenido principal para lectores de pantalla.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-brand-800 focus:shadow"
      >
        Saltar al contenido principal
      </a>

      <header className="bg-brand-700">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex flex-col text-white">
            <span className="text-lg font-bold leading-tight">Cursos UTA</span>
            <span className="text-xs text-brand-100">CFT Estatal de Magallanes</span>
          </Link>
          <nav aria-label="Navegación principal">
            <ul className="flex gap-1">
              <li>
                <NavLink to="/" end className={navLinkClass}>
                  Inicio
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenido" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="border-t border-brand-100 bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-muted">
          <p className="font-semibold text-ink">
            Centro de Formación Técnica Estatal de Magallanes y la Antártica Chilena
          </p>
          <p>Unidad de Tecnologías para el Aprendizaje (UTA)</p>
        </div>
      </footer>
    </div>
  );
}
