import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Pago con la pasarela simulada (RF-03) sobre los datos de demostración. Solo contra el stack
 * completo (E2E_BASE_URL). Crea órdenes y consume cupos: corre en el proyecto `stateful`.
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** Compra una edición hasta dejar la orden creada y devuelve en la página de la orden. */
async function createOrder(page: Page, slug: string, editionCode: string, buyer: string) {
  await page.goto(`/cursos/${slug}`);
  await page.getByRole('button', { name: `Agregar al carrito la edición ${editionCode}` }).click();
  await expect(page.getByText('Está en tu carrito.')).toBeVisible();
  await page.goto('/checkout');
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name: buyer }).click();
  await expect(page).toHaveURL('/checkout');

  const form = page.getByRole('form', { name: 'Datos de la compra' });
  await expect(form.getByRole('checkbox')).toHaveCount(4);
  for (const box of await form.getByRole('checkbox').all()) await box.check();
  await form.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Orden creada' })).toBeVisible();
}

async function payWith(page: Page, option: string) {
  await page.getByRole('button', { name: /^Pagar \$/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pasarela de pagos simulada' }),
  ).toBeVisible();
  await page.getByRole('link', { name: option }).click();
}

test('an approved payment confirms the purchase and gives the receipt', async ({ page }) => {
  await createOrder(page, 'programacion-web-con-javascript', 'JS-DEMO-1', 'Administración UTA');
  await expectAccessible(page);
  await payWith(page, 'Aprobar el pago');

  await expect(page).toHaveURL(/\/ordenes\/UTA-\d{4}-\d{6}\?pago=aprobado$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Compra confirmada' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Tu pago fue aprobado');
  await expect(page.getByText(/Tarjeta terminada en 6623/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pagar/ })).toHaveCount(0);
  await expectAccessible(page);

  const href = await page
    .getByRole('link', { name: 'Descargar comprobante (PDF)' })
    .getAttribute('href');
  const receipt = await page.request.get(href ?? '');
  expect(receipt.status()).toBe(200);
  expect(receipt.headers()['content-type']).toBe('application/pdf');
  expect((await receipt.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // Doble retorno del navegador: recargar no cambia nada.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Compra confirmada' })).toBeVisible();
});

test('a rejected payment can be retried, and finance can refund it', async ({ page }) => {
  await createOrder(page, 'programacion-web-con-javascript', 'JS-DEMO-2', 'Finanzas UTA');
  await payWith(page, 'Rechazar el pago');
  await expect(page).toHaveURL(/pago=rechazado$/);
  await expect(page.getByRole('alert')).toContainText('no se realizó ningún cobro');
  await expectAccessible(page);

  await payWith(page, 'Aprobar el pago');
  await expect(page.getByRole('heading', { level: 1, name: 'Compra confirmada' })).toBeVisible();
  const number = new URL(page.url()).pathname.split('/').pop() ?? '';

  // Devolución total desde el panel.
  await page.goto(`/admin/ordenes?numero=${number}`);
  const form = page.getByRole('form', { name: 'Devolver' });
  await form.getByLabel('Motivo').fill('Retracto del comprador');
  await form.getByRole('button', { name: 'Devolver' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Devolver' }).click();
  await expect(page.getByText('Devuelta', { exact: true })).toBeVisible();
  await expect(page.getByText(/Esta orden no tiene montos por devolver|Completada/)).toBeVisible();
  await expectAccessible(page);
});

test('an abandoned payment keeps the order payable', async ({ page }) => {
  await createOrder(page, 'excel-para-la-gestion', 'XLS-DEMO-1', 'Editora UTA');
  await payWith(page, 'Anular y volver al comercio');
  await expect(page).toHaveURL(/pago=abandonado$/);
  await expect(page.getByRole('status').first()).toContainText('El pago se canceló');
  await expect(page.getByRole('button', { name: /^Pagar \$/ })).toBeEnabled();
});
