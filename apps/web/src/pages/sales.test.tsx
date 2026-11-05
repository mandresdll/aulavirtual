import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadForm } from '../components/LeadForm';
import { setCsrfToken } from '../lib/api';
import { captureUtm, readUtm } from '../lib/utm';
import { mockServer } from '../test-server';
import { DiffusionPage } from './admin/DiffusionPage';
import { DocumentsPage } from './admin/DocumentsPage';
import { OrdersPage } from './admin/OrdersPage';
import { ReconciliationPage } from './admin/ReconciliationPage';
import { ReportsPage } from './admin/ReportsPage';
import { UnsubscribePage } from './UnsubscribePage';

function renderPage(element: ReactNode, path = '/', pattern = '/') {
  const router = createMemoryRouter([{ path: pattern, element }], { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 20, total: 1, totalPages: 1 });

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  setCsrfToken(null);
});

describe('campaign attribution', () => {
  it('keeps the UTM of the landing during the visit', () => {
    captureUtm('?utm_source=facebook&utm_campaign=2027');
    captureUtm('?q=excel');
    expect(readUtm()).toEqual({ source: 'facebook', campaign: '2027' });
  });
});

describe('lead form', () => {
  it('starts unchecked and does not send without consent', async () => {
    const calls = mockServer({ 'POST /api/leads': { status: 204 } });
    renderPage(<LeadForm courseSlug="excel" />);
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();

    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.cl');
    await userEvent.click(screen.getByRole('button', { name: 'Quiero recibir novedades' }));
    expect(await screen.findByText('Debes aceptar para recibir novedades')).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/api/leads')).toHaveLength(0);
  });

  it('sends the course, the consent version and the campaign', async () => {
    captureUtm('?utm_campaign=2027');
    const calls = mockServer({ 'POST /api/leads': { status: 204 } });
    renderPage(<LeadForm courseSlug="excel" />);
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.cl');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Quiero recibir novedades' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Te avisaremos');
    expect(calls.find((call) => call.path === '/api/leads')?.body).toMatchObject({
      email: 'ana@example.cl',
      courseSlug: 'excel',
      consent: true,
      utm: { campaign: '2027' },
    });
  });
});

describe('unsubscribe page', () => {
  const token = 'a'.repeat(64);

  it('unsubscribes just by opening the link', async () => {
    const calls = mockServer({ [`POST /api/leads/unsubscribe/${token}`]: { status: 204 } });
    renderPage(<UnsubscribePage />, `/baja/${token}`, '/baja/:token');
    expect(await screen.findByText(/Ya no recibirás novedades/)).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('explains an invalid link', async () => {
    mockServer({});
    renderPage(<UnsubscribePage />, `/baja/${token}`, '/baja/:token');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('diffusion page', () => {
  const server = {
    'GET /api/admin/leads': paged([
      {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'ana@example.cl',
        name: null,
        courseTitle: 'Excel',
        status: 'active',
        consentVersion: '2026.1',
        consentedAt: '2026-06-01T12:00:00.000Z',
        utmCampaign: null,
      },
    ]),
    'GET /api/admin/campaigns': {
      audience: 3,
      items: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          subject: 'Novedades de junio',
          body: 'Texto del mensaje',
          status: 'draft',
          createdAt: '2026-06-01T12:00:00.000Z',
          sentAt: null,
          recipients: 0,
          sent: 0,
          failed: 0,
        },
      ],
    },
  };

  it('builds a link with the campaign', async () => {
    mockServer(server);
    renderPage(<DiffusionPage />);
    expect(screen.getByText('Escribe al menos la fuente para ver el enlace.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Fuente'), 'facebook');
    await userEvent.type(screen.getByLabelText('Campaña'), '2027');
    expect(screen.getByText(/utm_source=facebook&utm_campaign=2027/)).toBeInTheDocument();
  });

  it('asks before sending, saying how many will receive it', async () => {
    const calls = mockServer({
      ...server,
      'POST /api/admin/campaigns/00000000-0000-4000-8000-000000000002/send': {
        ...server['GET /api/admin/campaigns'].items[0],
        status: 'sending',
      },
    });
    renderPage(<DiffusionPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Enviar novedad Novedades de junio' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Se enviará a 3 correos');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Novedad en envío.')).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/send'))).toBe(true);
  });

  it('lists the leads with their consent', async () => {
    mockServer(server);
    renderPage(<DiffusionPage />);
    expect(await screen.findByRole('cell', { name: 'ana@example.cl' })).toBeInTheDocument();
    expect(screen.getByText(/v2026\.1/)).toBeInTheDocument();
  });
});

describe('sales list', () => {
  it('filters and links each order to its detail', async () => {
    const calls = mockServer({
      'GET /api/admin/sales': paged([
        {
          number: 'UTA-2026-000123',
          status: 'paid',
          createdAt: '2026-06-01T12:00:00.000Z',
          paidAt: '2026-06-01T12:05:00.000Z',
          buyerName: 'Ana Soto',
          buyerEmail: 'ana@example.cl',
          courses: ['Excel'],
          discountClp: 0,
          totalClp: 50000,
          refundedClp: 0,
          documentType: 'receipt',
          documentStatus: 'issued',
          folio: '55',
          utmCampaign: null,
        },
      ]),
    });
    renderPage(<OrdersPage />);
    const link = await screen.findByRole('link', { name: 'UTA-2026-000123' });
    expect(link).toHaveAttribute('href', '/?numero=UTA-2026-000123');
    expect(screen.getByText(/folio 55/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar en Excel' })).toHaveAttribute(
      'href',
      '/api/admin/sales/export?format=xlsx',
    );

    await userEvent.type(screen.getByLabelText('Comprador u orden'), 'ana');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByRole('link', { name: 'Descargar en CSV' })).toHaveAttribute(
      'href',
      '/api/admin/sales/export?q=ana&format=csv',
    );
    expect(calls.at(-1)?.path).toBe('/api/admin/sales');
  });
});

describe('documents page', () => {
  const document = {
    id: '00000000-0000-4000-8000-000000000003',
    orderNumber: 'UTA-2026-000123',
    type: 'receipt',
    status: 'exported',
    receiverName: 'Ana Soto',
    totalClp: 50000,
    refundedClp: 0,
    paidAt: '2026-06-01T12:05:00.000Z',
    folio: null,
    exportedAt: null,
    lastError: null,
  };

  it('asks for the folio when documents go by file', async () => {
    const calls = mockServer({
      'GET /api/admin/documents': { ...paged([document]), deliveredByFile: true },
      [`POST /api/admin/documents/${document.id}/folio`]: { ...document, folio: '9' },
    });
    renderPage(<DocumentsPage />);
    await userEvent.type(await screen.findByLabelText('Folio'), '9');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/folio'))?.body).toEqual({ folio: '9' }),
    );
  });

  it('does not ask for it when the system answers by itself', async () => {
    mockServer({ 'GET /api/admin/documents': { ...paged([document]), deliveredByFile: false } });
    renderPage(<DocumentsPage />);
    expect(await screen.findByText(/UTA-2026-000123/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Folio')).toBeNull();
  });

  it('offers to retry a rejected document', async () => {
    const failed = { ...document, status: 'failed', lastError: 'Rechazado' };
    mockServer({ 'GET /api/admin/documents': { ...paged([failed]), deliveredByFile: false } });
    renderPage(<DocumentsPage />);
    expect(await screen.findByText('Rechazado')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reintentar documento de UTA-2026-000123' }),
    ).toBeInTheDocument();
  });
});

describe('reconciliation page', () => {
  const item = {
    id: '00000000-0000-4000-8000-000000000004',
    orderNumber: 'UTA-2026-000123',
    buyOrder: 'BO-1',
    kind: 'status_mismatch',
    localStatus: 'authorized',
    gatewayStatus: 'reversed',
    localAmountClp: 50000,
    gatewayAmountClp: 50000,
    day: '2026-06-01',
  };

  it('requires an explanation to resolve a difference', async () => {
    const calls = mockServer({
      'GET /api/admin/reconciliation': {
        lastRun: {
          day: '2026-06-01',
          checked: 4,
          discrepancies: 1,
          failed: 0,
          finishedAt: '2026-06-02T10:00:00.000Z',
        },
        items: [item],
      },
      [`POST /api/admin/reconciliation/${item.id}/resolve`]: { status: 204 },
    });
    renderPage(<ReconciliationPage />);
    expect(await screen.findByText(/4 revisadas, 1 diferencias/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Resolver diferencia de UTA-2026-000123' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Explica cómo se resolvió')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Cómo se resolvió'), 'Revisado con Transbank');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() =>
      expect(calls.find((call) => call.path.endsWith('/resolve'))?.body).toEqual({
        note: 'Revisado con Transbank',
      }),
    );
  });
});

describe('reports page', () => {
  const metrics = {
    orders: 2,
    grossClp: 100000,
    discountClp: 10000,
    refundsClp: 5000,
    netClp: 85000,
    paidEnrollments: 2,
    freeEnrollments: 1,
    completed: 3,
    failedCourse: 1,
    certificates: 3,
  };

  it('shows totals, the same data as a table, and the downloads', async () => {
    mockServer({
      'GET /api/admin/reports': {
        totals: metrics,
        rows: [{ ...metrics, key: 'c1', label: 'Excel' }],
        conversion: [
          { source: '', medium: '', campaign: '', views: 9, leads: 0, orders: 1, paid: 1 },
        ],
      },
    });
    renderPage(<ReportsPage />, '/?from=2026-06-01&to=2026-06-30&groupBy=month');
    expect(await screen.findByText('75 %')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Excel' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '(directo)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar la conversión en CSV' })).toHaveAttribute(
      'href',
      '/api/admin/reports/export?from=2026-06-01&to=2026-06-30&groupBy=month&table=conversion&format=csv',
    );
  });

  it('warns about an inverted period and falls back to the current month', async () => {
    mockServer({
      'GET /api/admin/reports': {
        totals: { ...metrics, completed: 0, failedCourse: 0 },
        rows: [],
        conversion: [],
      },
    });
    renderPage(<ReportsPage />, '/?from=2026-06-30&to=2026-06-01');
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa las fechas');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });
});
