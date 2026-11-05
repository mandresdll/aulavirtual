import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes';
import { mockServer } from '../test-server';

const SESSION = {
  authenticated: true,
  csrfToken: 'csrf-123',
  user: { name: 'Estudiante', email: 'e@example.com', roles: ['community_member'], profiles: [] },
};

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verification page', () => {
  it('shows a valid certificate', async () => {
    mockServer({
      'GET /api/auth/session': { authenticated: false },
      'GET /api/verify/ABCD-EFGH-JKMN': {
        status: 'valid',
        code: 'ABCD-EFGH-JKMN',
        holderName: 'Ana Soto',
        courseTitle: 'Excel',
        hours: 20,
        issuedAt: '2026-06-01T12:00:00.000Z',
      },
    });
    renderAt('/verificar/ABCD-EFGH-JKMN');
    expect(await screen.findByText('Certificado válido')).toBeInTheDocument();
    expect(screen.getByText('Ana Soto')).toBeInTheDocument();
  });

  it('links a replaced certificate to the current code', async () => {
    mockServer({
      'GET /api/auth/session': { authenticated: false },
      'GET /api/verify/ABCD-EFGH-JKMN': {
        status: 'reissued',
        code: 'ABCD-EFGH-JKMN',
        replacedBy: 'WXYZ-WXYZ-WXYZ',
      },
    });
    renderAt('/verificar/ABCD-EFGH-JKMN');
    expect(await screen.findByRole('link', { name: 'WXYZ-WXYZ-WXYZ' })).toHaveAttribute(
      'href',
      '/verificar/WXYZ-WXYZ-WXYZ',
    );
  });

  it('goes to the typed code', async () => {
    mockServer({
      'GET /api/auth/session': { authenticated: false },
      'GET /api/verify/NO-EXISTE': { status: 'not_found' },
    });
    const router = renderAt('/verificar');
    await userEvent.type(screen.getByLabelText('Código del certificado'), 'NO-EXISTE');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText('Certificado no encontrado')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/verificar/NO-EXISTE');
  });
});

describe('my courses page', () => {
  const course = {
    editionId: '11111111-1111-4111-8111-111111111111',
    courseTitle: 'Excel',
    courseSlug: 'excel',
    editionCode: 'XLS-1',
    startsAt: '2026-06-01T12:00:00.000Z',
    endsAt: '2026-06-30T12:00:00.000Z',
  };

  it('offers the Aula Virtual while enrolled and the certificate once approved', async () => {
    mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/my/courses': {
        lmsUrl: 'https://aula.example.cl',
        items: [
          { ...course, status: 'enrolled', certificateCode: null },
          {
            ...course,
            editionId: '22222222-2222-4222-8222-222222222222',
            courseTitle: 'Word',
            status: 'completed',
            certificateCode: 'ABCD-EFGH-JKMN',
          },
        ],
      },
    });
    renderAt('/mis-cursos');
    expect(await screen.findByRole('link', { name: 'Ir al Aula Virtual' })).toHaveAttribute(
      'href',
      'https://aula.example.cl',
    );
    expect(screen.getByRole('link', { name: 'Descargar certificado (PDF)' })).toHaveAttribute(
      'href',
      '/api/my/certificates/ABCD-EFGH-JKMN/pdf',
    );
  });

  it('sends visitors to the login page', async () => {
    mockServer({ 'GET /api/auth/session': { authenticated: false } });
    const router = renderAt('/mis-cursos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ingresar' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fmis-cursos');
  });
});
