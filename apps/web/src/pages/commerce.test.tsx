import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes';
import { courseDetail, edition } from '../test-fixtures';
import { mockServer } from '../test-server';

const EDITION_ID = '11111111-1111-4111-8111-111111111111';

const SESSION = {
  authenticated: true,
  csrfToken: 'csrf-123',
  user: { name: 'Estudiante', email: 'e@example.com', roles: ['community_member'], profiles: [] },
};

const LEGAL = [
  { type: 'terms', version: '2026.1', title: 'Términos y condiciones' },
  { type: 'privacy', version: '2026.1', title: 'Política de privacidad' },
  { type: 'withdrawal', version: '2026.1', title: 'Derecho de retracto' },
  { type: 'refunds', version: '2026.1', title: 'Política de devoluciones' },
];

const cartItem = {
  editionId: EDITION_ID,
  editionCode: 'JS-2026-1',
  courseSlug: 'programacion-web-con-javascript',
  courseTitle: 'Programación web con JavaScript',
  startsAt: '2026-06-20T12:00:00.000Z',
  priceClp: 89_000,
  taxTreatment: 'exempt',
  unavailableReason: null,
};

const quote = (overrides: Record<string, unknown> = {}) => ({
  lines: [
    {
      editionId: EDITION_ID,
      courseTitle: cartItem.courseTitle,
      editionCode: 'JS-2026-1',
      unitPriceClp: 89_000,
      discountClp: 0,
      totalClp: 89_000,
      taxTreatment: 'exempt',
    },
  ],
  subtotalClp: 89_000,
  discountClp: 0,
  totalClp: 89_000,
  coupon: null,
  couponError: null,
  legal: LEGAL,
  ...overrides,
});

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
  window.localStorage.clear();
});

describe('anonymous cart', () => {
  it('adds an edition from the course page to the browser cart', async () => {
    const detail = courseDetail({ editions: [edition({ id: EDITION_ID })] });
    mockServer({
      'GET /api/auth/session': { authenticated: false },
      [`GET /api/catalog/courses/${detail.slug}`]: detail,
      'GET /api/cart/preview': { items: [cartItem], subtotalClp: 89_000 },
    });
    renderAt(`/cursos/${detail.slug}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Agregar al carrito la edición JS-2026-1' }),
    );
    expect(JSON.parse(window.localStorage.getItem('cursos-uta:carrito') ?? '[]')).toEqual([
      EDITION_ID,
    ]);
    expect(await screen.findByRole('link', { name: 'Carrito (1)' })).toBeInTheDocument();
    expect(await screen.findByText(/Está en tu carrito/)).toBeInTheDocument();
  });

  it('asks to sign in before paying', async () => {
    window.localStorage.setItem('cursos-uta:carrito', JSON.stringify([EDITION_ID]));
    mockServer({
      'GET /api/auth/session': { authenticated: false },
      'GET /api/cart/preview': { items: [cartItem], subtotalClp: 89_000 },
    });
    renderAt('/carrito');
    expect(await screen.findByRole('link', { name: 'Ingresar para comprar' })).toHaveAttribute(
      'href',
      '/ingresar?returnTo=%2Fcheckout',
    );
    expect(screen.getByText('$89.000', { selector: 'strong' })).toBeInTheDocument();
  });

  it('merges the browser cart into the account after signing in', async () => {
    window.localStorage.setItem('cursos-uta:carrito', JSON.stringify([EDITION_ID]));
    const calls = mockServer({
      'GET /api/auth/session': SESSION,
      'POST /api/cart/merge': { items: [cartItem], subtotalClp: 89_000 },
      'GET /api/cart': { items: [cartItem], subtotalClp: 89_000 },
    });
    renderAt('/carrito');
    await vi.waitFor(() =>
      expect(calls.find((call) => call.path === '/api/cart/merge')?.body).toEqual({
        editionIds: [EDITION_ID],
      }),
    );
    await vi.waitFor(() => expect(window.localStorage.getItem('cursos-uta:carrito')).toBeNull());
    expect(await screen.findByRole('link', { name: 'Continuar al pago' })).toBeInTheDocument();
  });
});

describe('checkout', () => {
  it('requires accepting every legal document (not pre-checked) before creating the order', async () => {
    const calls = mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/cart': { items: [cartItem], subtotalClp: 89_000 },
      'POST /api/checkout/quote': quote(),
      'POST /api/checkout/orders': () => ({
        status: 201,
        body: {
          number: 'UTA-2026-000001',
          status: 'awaiting_payment',
          lines: quote().lines,
          subtotalClp: 89_000,
          discountClp: 0,
          totalClp: 89_000,
          couponCode: null,
          documentType: 'receipt',
          expiresAt: '2026-06-01T12:15:00.000Z',
          createdAt: '2026-06-01T12:00:00.000Z',
          payment: null,
          paymentAttemptsLeft: 3,
        },
      }),
      'GET /api/orders/UTA-2026-000001': {
        number: 'UTA-2026-000001',
        status: 'awaiting_payment',
        lines: quote().lines,
        subtotalClp: 89_000,
        discountClp: 0,
        totalClp: 89_000,
        couponCode: null,
        documentType: 'receipt',
        expiresAt: '2026-06-01T12:15:00.000Z',
        createdAt: '2026-06-01T12:00:00.000Z',
        payment: null,
        paymentAttemptsLeft: 3,
      },
    });
    const router = renderAt('/checkout');
    const form = await screen.findByRole('form', { name: 'Datos de la compra' });
    const boxes = within(form).getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box).not.toBeChecked();

    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar compra' }));
    expect(within(form).getAllByText('Debes aceptar este documento')).toHaveLength(4);
    expect(calls.some((call) => call.path === '/api/checkout/orders')).toBe(false);

    for (const box of boxes) await userEvent.click(box);
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar compra' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ordenes/UTA-2026-000001'));
    const post = calls.find((call) => call.path === '/api/checkout/orders');
    expect(post?.headers.get('x-csrf-token')).toBe('csrf-123');
    expect(post?.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(post?.body).toMatchObject({
      documentType: 'receipt',
      invoice: null,
      acceptedLegal: LEGAL.map(({ type, version }) => ({ type, version })),
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Orden creada' }),
    ).toBeInTheDocument();
  });

  it('validates invoice data and shows the coupon result', async () => {
    mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/cart': { items: [cartItem], subtotalClp: 89_000 },
      'POST /api/checkout/quote': ({ body }: { body: unknown }) => ({
        body:
          (body as { couponCode: string | null }).couponCode === 'VENCIDO'
            ? quote({ couponError: 'El cupón está vencido.' })
            : quote(),
      }),
    });
    renderAt('/checkout');
    const form = await screen.findByRole('form', { name: 'Datos de la compra' });
    await userEvent.click(within(form).getByRole('radio', { name: 'Factura' }));
    await userEvent.type(within(form).getByLabelText('RUT de la empresa'), '11.111.111-2');
    for (const box of within(form).getAllByRole('checkbox')) await userEvent.click(box);
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar compra' }));
    expect(within(form).getByLabelText('RUT de la empresa')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(form).getByLabelText('Razón social')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.type(screen.getByLabelText('Cupón de descuento'), 'vencido');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText('El cupón está vencido.')).toBeInTheDocument();
  });

  it('sends visitors without a session to the login page', async () => {
    mockServer({ 'GET /api/auth/session': { authenticated: false } });
    const router = renderAt('/checkout');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/ingresar'));
    expect(router.state.location.search).toBe('?returnTo=%2Fcheckout');
  });
});

describe('order payment', () => {
  const order = (overrides: Record<string, unknown> = {}) => ({
    number: 'UTA-2026-000001',
    status: 'awaiting_payment',
    lines: quote().lines,
    subtotalClp: 89_000,
    discountClp: 0,
    totalClp: 89_000,
    couponCode: null,
    documentType: 'receipt',
    expiresAt: '2026-06-01T12:15:00.000Z',
    createdAt: '2026-06-01T12:00:00.000Z',
    payment: null,
    paymentAttemptsLeft: 3,
    ...overrides,
  });

  it('starts the payment with the CSRF token and goes to the gateway', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const calls = mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/orders/UTA-2026-000001': order(),
      'POST /api/orders/UTA-2026-000001/pay': {
        redirectUrl: 'https://cursos.example.cl/api/dev/mock-payment?token=abc',
        formFields: null,
      },
    });
    renderAt('/ordenes/UTA-2026-000001');
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar $89.000' }));
    await vi.waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://cursos.example.cl/api/dev/mock-payment?token=abc',
      ),
    );
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.headers.get('x-csrf-token')).toBe('csrf-123');
    vi.unstubAllGlobals();
  });

  it('sends Webpay the token by POST', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/orders/UTA-2026-000001': order(),
      'POST /api/orders/UTA-2026-000001/pay': {
        redirectUrl: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction',
        formFields: { token_ws: 'abc' },
      },
    });
    renderAt('/ordenes/UTA-2026-000001');
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar $89.000' }));
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());
    const form = submit.mock.contexts[0] as HTMLFormElement;
    expect(form.method.toUpperCase()).toBe('POST');
    expect(form.action).toBe('https://webpay3gint.transbank.cl/webpayserver/initTransaction');
    expect(new FormData(form).get('token_ws')).toBe('abc');
    form.remove();
  });

  it('explains a rejected payment and offers to retry', async () => {
    mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/orders/UTA-2026-000001': order({
        payment: {
          status: 'rejected',
          authorizationCode: null,
          cardLast4: null,
          paymentType: null,
          installments: null,
          confirmedAt: null,
        },
        paymentAttemptsLeft: 1,
      }),
    });
    renderAt('/ordenes/UTA-2026-000001?pago=rechazado');
    expect(await screen.findByRole('alert')).toHaveTextContent('no se realizó ningún cobro');
    expect(screen.getByRole('button', { name: 'Pagar $89.000' })).toBeEnabled();
    expect(screen.getByText(/Te queda un intento de pago/)).toBeInTheDocument();
  });

  it('offers the receipt of a paid order and no payment button', async () => {
    mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/orders/UTA-2026-000001': order({
        status: 'paid',
        payment: {
          status: 'authorized',
          authorizationCode: '1213',
          cardLast4: '6623',
          paymentType: 'VN',
          installments: 0,
          confirmedAt: '2026-06-01T12:05:00.000Z',
        },
      }),
    });
    renderAt('/ordenes/UTA-2026-000001?pago=aprobado');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Compra confirmada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar comprobante (PDF)' })).toHaveAttribute(
      'href',
      '/api/orders/UTA-2026-000001/receipt',
    );
    expect(screen.getByText(/Tarjeta terminada en 6623/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pagar/ })).toBeNull();
  });

  it('tells the buyer when the order can no longer be paid', async () => {
    mockServer({
      'GET /api/auth/session': SESSION,
      'GET /api/orders/UTA-2026-000001': order({ status: 'cancelled' }),
    });
    renderAt('/ordenes/UTA-2026-000001?pago=vencido');
    expect(await screen.findByRole('alert')).toHaveTextContent('El plazo para pagar terminó');
    expect(screen.getByText(/ya no se puede pagar/)).toBeInTheDocument();
  });
});

describe('legal pages', () => {
  it('renders the current version as Markdown without executing HTML', async () => {
    mockServer({
      'GET /api/auth/session': { authenticated: false },
      'GET /api/legal': {
        items: [
          {
            type: 'withdrawal',
            version: '2026.1',
            title: 'Derecho de retracto',
            content: '## Plazo\n\nTienes **10 días**. <script>alert(1)</script>',
            contentSha256: 'a'.repeat(64),
            effectiveFrom: '2026-01-01T03:00:00.000Z',
          },
        ],
      },
    });
    renderAt('/legal/retracto');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Derecho de retracto' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Plazo' })).toBeInTheDocument();
    expect(screen.getByText('10 días', { selector: 'strong' })).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.getByText(/Versión 2026.1/)).toBeInTheDocument();
  });

  it('links every legal text from the footer', async () => {
    mockServer({ 'GET /api/auth/session': { authenticated: false } });
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Información legal' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/legal/terminos', '/legal/privacidad', '/legal/retracto', '/legal/devoluciones']);
  });
});
