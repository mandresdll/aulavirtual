import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockServer } from '../../test-server';
import { PrivacyPage } from './PrivacyPage';

const summary = {
  name: 'Ana Soto',
  orders: 2,
  enrollments: 1,
  certificates: 1,
  leads: 1,
  blockedReason: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PrivacyPage />
    </QueryClientProvider>,
  );
}

async function search() {
  await userEvent.type(screen.getByLabelText('Correo del titular'), 'ana@example.cl');
  await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('privacy page', () => {
  it('sends the email in the body, never in the URL', async () => {
    const calls = mockServer({ 'POST /api/admin/data-subjects/search': summary });
    renderPage();
    await search();
    expect(await screen.findByRole('heading', { name: 'Ana Soto' })).toBeInTheDocument();
    expect(calls[0]?.path).toBe('/api/admin/data-subjects/search');
    expect(calls[0]?.body).toEqual({ email: 'ana@example.cl' });
  });

  it('validates the email', async () => {
    const calls = mockServer({});
    renderPage();
    await userEvent.type(screen.getByLabelText('Correo del titular'), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('warns before anonymizing and confirms the result', async () => {
    const calls = mockServer({
      'POST /api/admin/data-subjects/search': summary,
      'POST /api/admin/data-subjects/anonymize': { status: 204 },
    });
    renderPage();
    await search();
    await userEvent.click(await screen.findByRole('button', { name: 'Anonimizar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('no se puede deshacer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar' }));
    expect(await screen.findByText('Los datos fueron anonimizados.')).toBeInTheDocument();
    expect(calls.at(-1)?.path).toBe('/api/admin/data-subjects/anonymize');
  });

  it('explains why a person cannot be anonymized yet', async () => {
    mockServer({
      'POST /api/admin/data-subjects/search': {
        ...summary,
        blockedReason: 'Tiene un curso en curso.',
      },
    });
    renderPage();
    await search();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiene un curso en curso.');
    expect(screen.getByRole('button', { name: 'Anonimizar' })).toBeDisabled();
  });

  it('shows when nothing is found', async () => {
    mockServer({
      'POST /api/admin/data-subjects/search': () => ({
        status: 404,
        body: {
          error: {
            code: 'NOT_FOUND',
            message: 'No hay datos asociados a ese correo.',
            requestId: 'r1',
          },
        },
      }),
    });
    renderPage();
    await search();
    expect(await screen.findByText('No hay datos asociados a ese correo.')).toBeInTheDocument();
  });
});
