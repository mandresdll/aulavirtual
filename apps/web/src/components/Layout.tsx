import {
  canAccessAdmin,
  LEGAL_DOCUMENT_LABELS,
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENT_TYPES,
} from '@plataforma/shared';
import { useEffect, useMemo, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useCart, useMergeLocalCart } from '../lib/cart';
import { useProviderInfo } from '../lib/commerce';
import { useLogout, useSession } from '../lib/session';
import { captureUtm } from '../lib/utm';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 ${
    isActive ? 'bg-brand-800 underline underline-offset-4' : ''
  }`;

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const firstRender = useRef(true);
  useMergeLocalCart();
  // Antes de que las páginas hijas lean las UTM de la visita.
  useMemo(() => captureUtm(location.search), [location.search]);

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
              <li>
                <NavLink to="/cursos" className={navLinkClass}>
                  Cursos
                </NavLink>
              </li>
              <li>
                <NavLink to="/verificar" className={navLinkClass}>
                  Verificar certificado
                </NavLink>
              </li>
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <CartLink />
            <SessionMenu />
          </div>
        </div>
      </header>

      <main id="contenido" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="border-t border-brand-100 bg-surface-muted">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 text-sm text-ink-muted sm:grid-cols-2">
          <ProviderInfo />
          <nav aria-label="Información legal">
            <h2 className="font-semibold text-ink">Información al consumidor</h2>
            <ul className="mt-1 space-y-1">
              {LEGAL_DOCUMENT_TYPES.map((type) => (
                <li key={type}>
                  <Link to={`/legal/${LEGAL_DOCUMENT_SLUGS[type]}`} className="underline">
                    {LEGAL_DOCUMENT_LABELS[type]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Ingreso o, con sesión, nombre del usuario, acceso al panel y cierre de sesión. */
function SessionMenu() {
  const session = useSession();
  const logout = useLogout();
  const location = useLocation();

  if (session.isPending) return null;
  if (!session.data?.authenticated) {
    if (location.pathname === '/ingresar') return null;
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Link
        to={`/ingresar?${new URLSearchParams({ returnTo }).toString()}`}
        className="rounded border border-white px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
      >
        Ingresar
      </Link>
    );
  }

  const { user } = session.data;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-white">
      <span className="font-medium">{user.name}</span>
      <NavLink to="/mis-cursos" className={navLinkClass}>
        Mis cursos
      </NavLink>
      {canAccessAdmin(user.roles) && (
        <NavLink to="/admin" className={navLinkClass}>
          Panel
        </NavLink>
      )}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="rounded border border-white px-3 py-2 font-medium hover:bg-brand-800 disabled:opacity-70"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

/** Datos del proveedor visibles para el consumidor (Ley 19.496). */
function ProviderInfo() {
  const provider = useProviderInfo();
  return (
    <div>
      <p className="font-semibold text-ink">
        {provider.data?.name ??
          'Centro de Formación Técnica Estatal de Magallanes y la Antártica Chilena'}
      </p>
      <p>Unidad de Tecnologías para el Aprendizaje (UTA)</p>
      {provider.data && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2">
          <dt>RUT:</dt>
          <dd>{provider.data.rut}</dd>
          <dt>Dirección:</dt>
          <dd>{provider.data.address}</dd>
          <dt>Correo:</dt>
          <dd>{provider.data.email}</dd>
          <dt>Teléfono:</dt>
          <dd>{provider.data.phone}</dd>
        </dl>
      )}
    </div>
  );
}

function CartLink() {
  const cart = useCart();
  const count = cart.count;
  return (
    <NavLink to="/carrito" className={navLinkClass}>
      Carrito ({count})
    </NavLink>
  );
}
