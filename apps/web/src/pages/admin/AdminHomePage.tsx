import { hasPermission, type Permission } from '@plataforma/shared';
import { Link } from 'react-router';
import { useSession } from '../../lib/session';
import { useDocumentTitle } from '../../lib/use-document-title';

const CARDS: { to: string; title: string; text: string; permission: Permission }[] = [
  {
    to: '/admin/cursos',
    title: 'Cursos y ediciones',
    text: 'Crea cursos, publícalos y gestiona sus ediciones: fechas, cupos y precios.',
    permission: 'catalog:manage',
  },
  {
    to: '/admin/areas',
    title: 'Áreas',
    text: 'Áreas temáticas que agrupan los cursos.',
    permission: 'catalog:manage',
  },
  {
    to: '/admin/docentes',
    title: 'Docentes',
    text: 'Docentes que se muestran en las fichas.',
    permission: 'catalog:manage',
  },
  {
    to: '/admin/inscripciones',
    title: 'Inscripciones',
    text: 'Matrículas fallidas en el Aula Virtual y listas de espera.',
    permission: 'enrollments:manage',
  },
  {
    to: '/admin/cupones',
    title: 'Cupones',
    text: 'Descuentos, becas y convenios con vigencia y límites de uso.',
    permission: 'coupons:manage',
  },
  {
    to: '/admin/ordenes',
    title: 'Órdenes',
    text: 'Consulta órdenes y sus pagos, y realiza devoluciones.',
    permission: 'orders:refund',
  },
  {
    to: '/admin/legales',
    title: 'Textos legales',
    text: 'Términos, privacidad, retracto y devoluciones, con versiones.',
    permission: 'legal:manage',
  },
  {
    to: '/admin/auditoria',
    title: 'Auditoría',
    text: 'Registro de solo lectura de los cambios y accesos.',
    permission: 'audit:read',
  },
];

/** Inicio del panel de administración. */
export function AdminHomePage() {
  useDocumentTitle('Administración');
  const session = useSession();
  const user = session.data?.authenticated ? session.data.user : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Panel de administración</h1>
      {user && <p className="mt-2 text-ink-muted">Hola, {user.name}.</p>}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.filter((card) => user && hasPermission(user.roles, card.permission)).map((card) => (
          <li key={card.to} className="rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold">
              <Link to={card.to} className="text-brand-700 underline">
                {card.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{card.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
