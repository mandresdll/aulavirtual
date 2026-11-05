import type { PlatformRole } from '@plataforma/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Layout } from '../../components/Layout';
import { setCsrfToken } from '../../lib/api';
import { LoginPage } from '../LoginPage';
import { AdminLayout, RequirePermission } from './AdminApp';
import { AdminHomePage } from './AdminHomePage';
import { AreasPage } from './AreasPage';
import { AuditPage } from './AuditPage';
import { EnrollmentsPage } from './EnrollmentsPage';
import { LegalAdminPage } from './LegalAdminPage';
import { OrdersPage } from './OrdersPage';
import { mockServer } from '../../test-server';

/**
 * Panel en jsdom: las rutas se declaran sin `lazy` (jsdom no puede cargarlas, ver app.test.tsx);
 * los componentes son los mismos que usa `routes.tsx`.
 */
const testRoutes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <p>Portada</p> },
      { path: 'ingresar', element: <LoginPage /> },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminHomePage /> },
          { path: 'areas', element: <AreasPage /> },
          { path: 'ordenes', element: <OrdersPage /> },
          { path: 'inscripciones', element: <EnrollmentsPage /> },
          { path: 'legales', element: <LegalAdminPage /> },
          {
            path: 'auditoria',
            element: (
              <RequirePermission permission="audit:read">
                <AuditPage />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
];

function sessionAs(roles: PlatformRole[], name = 'Editora UTA') {
  return {
    authenticated: true,
    csrfToken: 'csrf-123',
    user: { name, email: 'editor.uta@example.com', roles, profiles: ['staff'] },
  };
}

function renderAt(path: string) {
  const router = createMemoryRouter(testRoutes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('admin guard', () => {
  it('sends visitors without a session to the login page and back afterwards', async () => {
    mockServer({ 'GET /api/auth/session': { authenticated: false } });
    const router = renderAt('/admin/areas');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingresar' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fadmin%2Fareas');
    expect(screen.getByRole('link', { name: 'Ingresar con cuenta institucional' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnTo=%2Fadmin%2Fareas',
    );
  });

  it('explains the access is denied to roles without admin permissions', async () => {
    mockServer({ 'GET /api/auth/session': sessionAs(['community_member'], 'Estudiante') });
    renderAt('/admin');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acceso no autorizado' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Secciones del panel' })).toBeNull();
  });

  it('shows editors the catalog sections but not the audit log', async () => {
    mockServer({ 'GET /api/auth/session': sessionAs(['uta_editor']) });
    renderAt('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(within(nav).getByRole('link', { name: 'Cursos' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Auditoría' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Panel de administración' }),
    ).toBeInTheDocument();
  });

  it('blocks the audit page for editors even by direct URL', async () => {
    mockServer({ 'GET /api/auth/session': sessionAs(['uta_editor']) });
    renderAt('/admin/auditoria');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acceso no autorizado' }),
    ).toBeInTheDocument();
  });
});

describe('login page', () => {
  it('explains why the login failed', async () => {
    mockServer({ 'GET /api/auth/session': { authenticated: false } });
    renderAt('/ingresar?error=no-disponible&returnTo=/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio de identidad institucional no está disponible',
    );
  });

  it('ignores external returnTo values', async () => {
    mockServer({ 'GET /api/auth/session': { authenticated: false } });
    renderAt('/ingresar?returnTo=//evil.example.com');
    expect(
      await screen.findByRole('link', { name: 'Ingresar con cuenta institucional' }),
    ).toHaveAttribute('href', '/api/auth/login?returnTo=%2F');
  });
});

describe('session menu', () => {
  it('shows the user, a link to the panel and logs out with the CSRF token', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const calls = mockServer({
      'GET /api/auth/session': sessionAs(['uta_admin'], 'Administración UTA'),
      'POST /api/auth/logout': { logoutUrl: null },
    });
    renderAt('/');
    expect(await screen.findByText('Administración UTA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('href', '/admin');

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    const logout = calls.find((call) => call.path === '/api/auth/logout');
    expect(logout?.headers.get('x-csrf-token')).toBe('csrf-123');
    vi.unstubAllGlobals();
  });
});

describe('areas page', () => {
  it('creates an area sending the CSRF token and shows the result', async () => {
    setCsrfToken(null);
    const areas = [
      { id: 'a1', slug: 'tecnologia', name: 'Tecnología', description: null, courseCount: 2 },
    ];
    const calls = mockServer({
      'GET /api/auth/session': sessionAs(['uta_editor']),
      'GET /api/admin/areas': () => ({ body: { items: areas } }),
      'POST /api/admin/areas': ({ body }: { body: unknown }) => {
        const created = { id: 'a2', courseCount: 0, ...(body as object) };
        areas.push(created as (typeof areas)[number]);
        return { status: 201, body: created };
      },
    });
    renderAt('/admin/areas');
    expect(await screen.findByRole('cell', { name: 'Tecnología' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nueva área' }));
    const form = screen.getByRole('form', { name: 'Nueva área' });
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar área' }));
    expect(within(form).getAllByText('Este campo es obligatorio').length).toBeGreaterThan(0);
    expect(within(form).getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(within(form).getByLabelText('Nombre'), 'Idiomas');
    await userEvent.type(within(form).getByLabelText(/slug/), 'idiomas');
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar área' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Se guardó el área «Idiomas».');
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.headers.get('x-csrf-token')).toBe('csrf-123');
    expect(post?.body).toEqual({ slug: 'idiomas', name: 'Idiomas', description: null });
    expect(await screen.findByRole('cell', { name: 'Idiomas' })).toBeInTheDocument();
  });

  it('shows the API message when an area in use cannot be deleted', async () => {
    mockServer({
      'GET /api/auth/session': sessionAs(['uta_editor']),
      'GET /api/admin/areas': {
        items: [{ id: 'a1', slug: 'ti', name: 'Tecnología', description: null, courseCount: 2 }],
      },
      'DELETE /api/admin/areas/a1': () => ({
        status: 409,
        body: {
          error: {
            code: 'IN_USE',
            message: 'No se puede eliminar el área porque tiene cursos.',
          },
        },
      }),
    });
    renderAt('/admin/areas');
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Tecnología' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar área' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se puede eliminar el área porque tiene cursos.',
    );
  });
});

describe('legal texts page', () => {
  it('asks for confirmation before publishing a version that cannot be changed', async () => {
    const calls = mockServer({
      'GET /api/auth/session': sessionAs(['uta_admin'], 'Administración UTA'),
      'GET /api/admin/legal': { items: [] },
      'POST /api/admin/legal': ({ body }: { body: unknown }) => ({
        status: 201,
        body: {
          ...(body as object),
          id: 'l1',
          contentSha256: 'a'.repeat(64),
          current: true,
          createdAt: '2026-06-01T12:00:00.000Z',
        },
      }),
    });
    renderAt('/admin/legales');
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva versión' }));
    const form = screen.getByRole('form', { name: 'Nueva versión de texto legal' });
    await userEvent.type(within(form).getByLabelText('Versión'), '2026.1');
    await userEvent.type(within(form).getByLabelText('Título'), 'Términos');
    await userEvent.type(within(form).getByLabelText('Contenido'), 'Texto legal');
    await userEvent.click(within(form).getByRole('button', { name: 'Publicar versión' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Publicar la versión 2026.1?');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText(/Se publicó la versión 2026.1/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      type: 'terms',
      version: '2026.1',
    });
  });
});

describe('enrollments page', () => {
  it('lists failed enrollments with their error and retries them', async () => {
    const failed = {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'failed',
      source: 'purchase',
      attempts: 5,
      lastError: 'Moodle: curso inexistente',
      user: { name: 'Ana Soto', email: 'ana@example.com' },
      courseTitle: 'Excel',
      editionCode: 'XLS-1',
      createdAt: '2026-06-01T12:00:00.000Z',
    };
    const calls = mockServer({
      'GET /api/auth/session': sessionAs(['uta_editor']),
      'GET /api/admin/enrollments': ({ url }: { url: URL }) => ({
        body: { items: url.searchParams.get('status') === 'failed' ? [failed] : [] },
      }),
      'GET /api/admin/waitlist': { items: [] },
      [`POST /api/admin/enrollments/${failed.id}/retry`]: () => ({ status: 204 }),
    });
    renderAt('/admin/inscripciones');
    expect(await screen.findByText(/Moodle: curso inexistente/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar matrícula de Ana Soto' }));
    await vi.waitFor(() =>
      expect(calls.find((call) => call.method === 'POST')?.headers.get('x-csrf-token')).toBe(
        'csrf-123',
      ),
    );
  });
});

describe('orders page', () => {
  const adminOrder = (overrides: Record<string, unknown> = {}) => ({
    number: 'UTA-2026-000001',
    status: 'paid',
    lines: [
      {
        editionId: 'e1',
        courseTitle: 'Excel para la gestión',
        editionCode: 'XLS-1',
        unitPriceClp: 45_000,
        discountClp: 0,
        totalClp: 45_000,
        taxTreatment: 'exempt',
      },
    ],
    subtotalClp: 45_000,
    discountClp: 0,
    totalClp: 45_000,
    couponCode: null,
    documentType: 'receipt',
    expiresAt: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    payment: null,
    paymentAttemptsLeft: 3,
    buyer: { name: 'Estudiante', email: 'e@example.com' },
    payments: [],
    refunds: [],
    history: [],
    refundableClp: 45_000,
    ...overrides,
  });

  it('refunds with a reason, after confirming, sending an idempotency key', async () => {
    const calls = mockServer({
      'GET /api/auth/session': sessionAs(['uta_finance'], 'Finanzas UTA'),
      'GET /api/admin/orders/UTA-2026-000001': adminOrder(),
      'POST /api/admin/orders/UTA-2026-000001/refunds': adminOrder({
        status: 'partially_refunded',
        refundableClp: 25_000,
      }),
    });
    renderAt('/admin/ordenes?numero=UTA-2026-000001');
    const form = await screen.findByRole('form', { name: 'Devolver' });
    await userEvent.click(within(form).getByRole('button', { name: 'Devolver' }));
    expect(await within(form).findByText(/Indica el motivo/)).toBeInTheDocument();

    const amount = within(form).getByLabelText('Monto a devolver (CLP)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '20000');
    await userEvent.type(within(form).getByLabelText('Motivo'), 'Retracto del comprador');
    await userEvent.click(within(form).getByRole('button', { name: 'Devolver' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('$20.000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));

    expect(await screen.findByText('Devolución realizada.')).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.body).toEqual({ amountClp: 20_000, reason: 'Retracto del comprador' });
    expect(post?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hides the refund form when nothing can be refunded', async () => {
    mockServer({
      'GET /api/auth/session': sessionAs(['uta_finance'], 'Finanzas UTA'),
      'GET /api/admin/orders/UTA-2026-000001': adminOrder({ refundableClp: 0 }),
    });
    renderAt('/admin/ordenes?numero=UTA-2026-000001');
    expect(await screen.findByText(/no tiene montos por devolver/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Devolver' })).toBeNull();
  });
});

describe('audit page', () => {
  it('lists entries with readable actions and filters by user', async () => {
    const calls = mockServer({
      'GET /api/auth/session': sessionAs(['uta_admin'], 'Administración UTA'),
      'GET /api/admin/audit': {
        items: [
          {
            id: '10',
            actorId: 'u1',
            actorName: 'Editora UTA',
            actorRole: 'uta_editor',
            action: 'edition.update',
            entityType: 'course_edition',
            entityId: 'e1',
            before: { priceClp: 89000 },
            after: { priceClp: 99000 },
            ip: '10.0.0.1',
            requestId: 'r1',
            createdAt: '2026-06-01T15:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    });
    renderAt('/admin/auditoria');
    expect(await screen.findByRole('cell', { name: 'Edición modificada' })).toBeInTheDocument();
    expect(screen.getByText(/99000/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Editora UTA.*ver sus acciones/ }));
    await vi.waitFor(() =>
      expect(calls.some((call) => call.path === '/api/admin/audit' && call.method === 'GET')).toBe(
        true,
      ),
    );
    expect(screen.getByText('Filtrando por usuario específico.')).toBeInTheDocument();
  });
});
