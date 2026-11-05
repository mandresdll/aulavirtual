import { DEFAULT_SITE_SETTINGS } from '@plataforma/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoursePreview } from '../../components/admin/CoursePreview';
import { Layout } from '../../components/Layout';
import { mockServer } from '../../test-server';
import { HomePage } from '../HomePage';
import { SettingsPage } from './SettingsPage';

function renderWith(element: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

function renderSite() {
  const router = createMemoryRouter([
    { path: '/', element: <Layout />, children: [{ index: true, element: <HomePage /> }] },
  ]);
  renderWith(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('style');
});

describe('settings page', () => {
  it('saves the texts', async () => {
    const calls = mockServer({
      'GET /api/settings': DEFAULT_SITE_SETTINGS,
      'PUT /api/admin/settings': { ...DEFAULT_SITE_SETTINGS, notice: 'Aviso' },
    });
    renderWith(<SettingsPage />);
    await userEvent.type(await screen.findByLabelText('Aviso general (opcional)'), 'Aviso');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ notice: 'Aviso' }),
    );
  });

  it('does not save a color that would make the site unreadable', async () => {
    const calls = mockServer({ 'GET /api/settings': DEFAULT_SITE_SETTINGS });
    renderWith(<SettingsPage />);
    await userEvent.type(await screen.findByLabelText('Color principal (opcional)'), '#ffee00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/El color es muy claro/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});

describe('public site', () => {
  const server = (settings = {}) => ({
    'GET /api/auth/session': { authenticated: false },
    'GET /api/settings': { ...DEFAULT_SITE_SETTINGS, ...settings },
    'GET /api/catalog/courses/featured': { items: [] },
    'GET /api/catalog/areas': { items: [] },
  });

  it('uses the configured texts, notice and color', async () => {
    mockServer(
      server({
        heroTitle: 'Matrícula abierta',
        notice: 'Cierre el viernes',
        brandColor: '#1d4ed8',
      }),
    );
    renderSite();
    expect(await screen.findByRole('heading', { name: 'Matrícula abierta' })).toBeInTheDocument();
    expect(screen.getByText('Cierre el viernes')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--brand-700')).toBe('#1d4ed8'),
    );
  });

  it('keeps working with the default texts if the settings fail', async () => {
    mockServer({ ...server(), 'GET /api/settings': () => ({ status: 500 }) });
    renderSite();
    expect(
      await screen.findByRole('heading', { name: DEFAULT_SITE_SETTINGS.heroTitle }),
    ).toBeInTheDocument();
  });
});

describe('course preview', () => {
  it('shows the format of the description and never its HTML', () => {
    render(
      <CoursePreview
        title="Excel"
        summary="Resumen"
        description={'**Importante**\n\n<script>alert(1)</script>'}
        objectivesText={'Uno\n\nDos'}
        contentsText=""
        requirements=""
      />,
    );
    expect(screen.getByText('Importante').tagName).toBe('STRONG');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(2);
  });
});
