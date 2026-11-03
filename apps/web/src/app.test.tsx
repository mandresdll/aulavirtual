import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './routes';

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

function mockFetch(response: Response | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe('public layout', () => {
  it('offers a skip link as the first focusable element', async () => {
    mockFetch(new Error('offline'));
    renderAt('/');
    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Saltar al contenido principal' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#contenido');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
  });

  it('shows the home page with a single h1 and labelled navigation', async () => {
    mockFetch(new Error('offline'));
    renderAt('/');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(document.title).toBe('Cursos UTA · CFT Estatal de Magallanes');
  });
});

describe('service status', () => {
  it('reports the API as online', async () => {
    mockFetch(
      new Response(
        JSON.stringify({ status: 'ok', version: '1.2.3', time: new Date().toISOString() }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    renderAt('/');
    expect(await screen.findByText('Servicio en línea (versión 1.2.3).')).toBeInTheDocument();
  });

  it('reports the API as unavailable in Spanish when it cannot connect', async () => {
    mockFetch(new Error('offline'));
    renderAt('/');
    expect(
      await screen.findByText('El servicio no está disponible en este momento.'),
    ).toBeInTheDocument();
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
  it('declares the admin area as a lazy route resolving to the admin page', async () => {
    const admin = routes[0]?.children?.find((route) => route.path === 'admin');
    expect(typeof admin?.lazy).toBe('function');
    const loaded = await (admin?.lazy as () => Promise<{ Component: React.ComponentType }>)();
    render(<loaded.Component />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Panel de administración' }),
    ).toBeInTheDocument();
  });
});
