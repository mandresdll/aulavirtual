import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './routes';
import { courseCard, courseDetail, edition, mockApi } from './test-fixtures';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function mockOffline() {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
}

describe('public layout', () => {
  it('offers a skip link as the first focusable element', async () => {
    mockOffline();
    renderAt('/');
    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Saltar al contenido principal' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#contenido');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
  });

  it('shows the home page with a single h1 and labelled navigation', async () => {
    mockOffline();
    renderAt('/');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(nav).toHaveTextContent('Cursos');
    expect(document.title).toBe('Cursos UTA · CFT Estatal de Magallanes');
  });
});

describe('home page', () => {
  it('lists the featured courses and the areas', async () => {
    mockApi({
      '/api/catalog/courses/featured': { items: [courseCard()] },
      '/api/catalog/areas': {
        items: [{ slug: 'ti', name: 'Tecnologías', description: 'Programación', courseCount: 2 }],
      },
    });
    renderAt('/');
    expect(
      await screen.findByRole('link', { name: 'Programación web con JavaScript' }),
    ).toHaveAttribute('href', '/cursos/programacion-web-con-javascript');
    expect(screen.getByText('$89.000')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Tecnologías/ })).toHaveAttribute(
      'href',
      '/cursos?area=ti',
    );
  });

  it('explains in Spanish when the catalog cannot be loaded', async () => {
    mockOffline();
    renderAt('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor.',
    );
  });
});

describe('catalog page', () => {
  it('sends the URL filters to the API and shows the results count', async () => {
    const fetch = mockApi({
      '/api/catalog/courses': {
        items: [courseCard()],
        page: 1,
        pageSize: 12,
        total: 1,
        totalPages: 1,
      },
      '/api/catalog/areas': { items: [] },
    });
    renderAt('/cursos?q=web&modality=online&invalid=1');
    expect(await screen.findByText('1 curso encontrado')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { level: 1, name: 'Catálogo de cursos' })).toBeVisible();
    expect(screen.getByLabelText('Buscar por nombre o tema')).toHaveValue('web');
    expect(screen.getByLabelText('Modalidad')).toHaveValue('online');
    const calledUrls = fetch.mock.calls.map(([url]) => String(url));
    expect(calledUrls).toContain('/api/catalog/courses?q=web&modality=online&page=1&pageSize=12');
    expect(document.title).toBe('Catálogo de cursos | Cursos UTA · CFT Estatal de Magallanes');
  });

  it('validates the date range with an accessible error message', async () => {
    mockApi({
      '/api/catalog/courses': { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 },
      '/api/catalog/areas': { items: [] },
    });
    const router = renderAt('/cursos');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-05-10');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-05-01');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('posterior a "Desde"');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription(/posterior a "Desde"/);
    expect(router.state.location.search).toBe('');
  });

  it('paginates keeping the filters', async () => {
    mockApi({
      '/api/catalog/courses': {
        items: [courseCard()],
        page: 2,
        pageSize: 12,
        total: 30,
        totalPages: 3,
      },
      '/api/catalog/areas': { items: [] },
    });
    renderAt('/cursos?q=web&page=2');
    const pagination = await screen.findByRole('navigation', { name: 'Paginación' });
    expect(pagination).toBeVisible();
    expect(screen.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/cursos?q=web&page=3',
    );
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/cursos?q=web');
  });
});

describe('course page', () => {
  it('shows the course details, editions, prices and seats', async () => {
    mockApi({ '/api/catalog/courses/programacion-web-con-javascript': courseDetail() });
    renderAt('/cursos/programacion-web-con-javascript');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Programación web con JavaScript' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Objetivos' })).toBeVisible();
    expect(screen.getByText('Construir páginas web accesibles')).toBeVisible();
    expect(screen.getByText('Camila Vidal Soto')).toBeVisible();
    expect(screen.getByText('12 cupos disponibles')).toBeVisible();
    expect(screen.getByText('¡Quedan 2 cupos!')).toBeVisible();
    expect(screen.getAllByText(/Exento de IVA/)).toHaveLength(2);
    expect(screen.getByRole('navigation', { name: 'Ruta de navegación' })).toBeVisible();
    expect(document.title).toBe(
      'Programación web con JavaScript | Cursos UTA · CFT Estatal de Magallanes',
    );
  });

  it('shows a Spanish not-found page for unknown courses', async () => {
    mockApi({});
    renderAt('/cursos/no-existe');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Curso no encontrado' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver el catálogo de cursos' })).toHaveAttribute(
      'href',
      '/cursos',
    );
  });

  it('labels sold-out and closed editions with text, not only color', async () => {
    mockApi({
      '/api/catalog/courses/programacion-web-con-javascript': courseDetail({
        editions: [
          edition({ id: 'a', availableSeats: 0 }),
          edition({ id: 'b', enrollmentOpen: false }),
        ],
      }),
    });
    renderAt('/cursos/programacion-web-con-javascript');
    expect(await screen.findByText('Sin cupos disponibles')).toBeVisible();
    expect(screen.getByText('Inscripciones cerradas')).toBeVisible();
  });
});

describe('routing', () => {
  it('shows a Spanish 404 page for unknown routes', async () => {
    renderAt('/no-existe');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeInTheDocument();
  });

  // La navegación real a /admin se prueba en E2E: en jsdom, React Router no puede crear el
  // Request de una ruta lazy (AbortSignal de jsdom incompatible con el fetch de Node).
  it('declares the admin area as a lazy route (separate chunk)', () => {
    const admin = routes[0]?.children?.find((route) => route.path === 'admin');
    expect(typeof admin?.lazy).toBe('function');
    expect(admin?.element).toBeUndefined();
  });
});
