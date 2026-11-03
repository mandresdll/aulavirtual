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

type Handler = (request: { method: string; url: URL; headers: Headers; body: unknown }) => {
  status?: number;
  body?: unknown;
};

/** API simulada por método y ruta; registra las llamadas para revisar cabeceras y cuerpo. */
function mockServer(handlers: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, headers, body });
    const handler = handlers[`${method} ${url.pathname}`];
    if (handler === undefined) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' } },
        { status: 404 },
      );
    }
    const result =
      typeof handler === 'function'
        ? (handler as Handler)({ method, url, headers, body })
        : { body: handler };
    if (result.status === 204) return new Response(null, { status: 204 });
    return Response.json(result.body ?? null, { status: result.status ?? 200 });
  });
  return calls;
}

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

    await userEvent.click(screen.getByRole('button', { name: 'Ver acciones de Editora UTA' }));
    await vi.waitFor(() =>
      expect(calls.some((call) => call.path === '/api/admin/audit' && call.method === 'GET')).toBe(
        true,
      ),
    );
    expect(screen.getByText('Filtrando por usuario específico.')).toBeInTheDocument();
  });
});
