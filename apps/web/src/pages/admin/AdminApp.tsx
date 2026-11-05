import { canAccessAdmin, hasPermission, type Permission } from '@plataforma/shared';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useSession } from '../../lib/session';
import { useDocumentTitle } from '../../lib/use-document-title';

const SECTIONS: { to: string; label: string; permission: Permission | null; end?: boolean }[] = [
  { to: '/admin', label: 'Inicio', permission: null, end: true },
  { to: '/admin/cursos', label: 'Cursos', permission: 'catalog:manage' },
  { to: '/admin/areas', label: 'Áreas', permission: 'catalog:manage' },
  { to: '/admin/docentes', label: 'Docentes', permission: 'catalog:manage' },
  { to: '/admin/inscripciones', label: 'Inscripciones', permission: 'enrollments:manage' },
  { to: '/admin/certificados', label: 'Certificados', permission: 'certificates:manage' },
  { to: '/admin/cupones', label: 'Cupones', permission: 'coupons:manage' },
  { to: '/admin/ordenes', label: 'Ventas', permission: 'orders:refund' },
  { to: '/admin/documentos', label: 'Documentos', permission: 'sales:manage' },
  { to: '/admin/conciliacion', label: 'Conciliación', permission: 'sales:manage' },
  { to: '/admin/reportes', label: 'Reportes', permission: 'reports:read' },
  { to: '/admin/difusion', label: 'Difusión', permission: 'diffusion:manage' },
  { to: '/admin/privacidad', label: 'Datos personales', permission: 'privacy:manage' },
  { to: '/admin/legales', label: 'Textos legales', permission: 'legal:manage' },
  { to: '/admin/auditoria', label: 'Auditoría', permission: 'audit:read' },
];

const sectionClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-2 text-sm font-medium hover:bg-brand-50 ${
    isActive ? 'bg-brand-100 text-brand-900 underline underline-offset-4' : 'text-ink'
  }`;

/**
 * Panel de administración (RF-07, RF-12). Se carga en un chunk aparte (code splitting) y solo
 * se muestra a quien tiene algún permiso del panel. La API valida los permisos en cada
 * llamada: esta guardia solo evita mostrar pantallas que fallarían.
 */
export function AdminLayout() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <LoadingMessage />;

  if (session.isError) {
    return (
      <AdminMessage title="Panel de administración">
        <ErrorMessage error={session.error} onRetry={() => void session.refetch()} />
      </AdminMessage>
    );
  }

  if (!session.data.authenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/ingresar?${new URLSearchParams({ returnTo }).toString()}`} replace />;
  }

  const { roles } = session.data.user;
  if (!canAccessAdmin(roles)) {
    return (
      <AdminMessage title="Acceso no autorizado">
        <p className="text-ink-muted">
          Tu cuenta no tiene permisos para el panel de administración. Si crees que es un error,
          solicita el rol correspondiente en el SGA.
        </p>
      </AdminMessage>
    );
  }

  const sections = SECTIONS.filter(
    (section) => section.permission === null || hasPermission(roles, section.permission),
  );
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[12rem_1fr]">
      <nav aria-label="Secciones del panel">
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {sections.map((section) => (
            <li key={section.to}>
              <NavLink to={section.to} end={section.end ?? false} className={sectionClass}>
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

function AdminMessage({ title, children }: { title: string; children: React.ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold text-brand-800">{title}</h1>
      {children}
    </div>
  );
}

/** Sección que exige un permiso específico (p. ej. auditoría solo para administración). */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const session = useSession();
  const roles = session.data?.authenticated ? session.data.user.roles : [];
  if (!hasPermission(roles, permission)) {
    return (
      <AdminMessage title="Acceso no autorizado">
        <p className="text-ink-muted">Tu rol no permite ver esta sección.</p>
      </AdminMessage>
    );
  }
  return <>{children}</>;
}
