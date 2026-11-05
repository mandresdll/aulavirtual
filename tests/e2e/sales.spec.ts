import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Difusión, ventas, documentos, conciliación y reportes (RF-02, RF-08, RF-09) sobre los datos de
 * demostración. Solo contra el stack completo (E2E_BASE_URL). Crea interesados y una orden pagada:
 * corre en el proyecto `stateful`, en serie porque cada prueba usa lo que dejó la anterior.
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');
test.describe.configure({ mode: 'serial' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const COURSE = 'programacion-web-con-javascript';
const EDITION = 'JS-DEMO-1';
const CAMPAIGN = `e2e-${Date.now()}`;

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** En pantalla angosta las tablas se desbordan: así se revisa su zona desplazable. */
async function expectAccessibleWhenNarrow(page: Page) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 480, height: 800 });
  await expectAccessible(page);
  if (size) await page.setViewportSize(size);
}

async function signIn(page: Page, name: string, path: string) {
  await page.goto(`/ingresar?returnTo=${encodeURIComponent(path)}`);
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name }).click();
  await expect(page).toHaveURL(path);
}

test('a visitor from a campaign leaves their email and buys, and the panel sees it', async ({
  page,
}) => {
  await page.goto(`/cursos/${COURSE}?utm_source=e2e&utm_medium=test&utm_campaign=${CAMPAIGN}`);
  const form = page.getByRole('form', { name: '¿Te interesa este curso?' });
  await form.getByRole('textbox', { name: 'Correo' }).fill(`${CAMPAIGN}@example.com`);
  await form.getByRole('checkbox').check();
  await expectAccessible(page);
  await form.getByRole('button', { name: 'Quiero recibir novedades' }).click();
  await expect(page.getByText('Te avisaremos las novedades')).toBeVisible();

  await page.getByRole('button', { name: `Agregar al carrito la edición ${EDITION}` }).click();
  await expect(page.getByText('Está en tu carrito.')).toBeVisible();
  await page.goto('/checkout');
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name: 'Finanzas UTA' }).click();
  await expect(page).toHaveURL('/checkout');
  const checkout = page.getByRole('form', { name: 'Datos de la compra' });
  await expect(checkout.getByRole('checkbox')).toHaveCount(4);
  for (const box of await checkout.getByRole('checkbox').all()) await box.check();
  await checkout.getByRole('button', { name: 'Confirmar compra' }).click();
  await page.getByRole('button', { name: /^Pagar \$/ }).click();
  await page.getByRole('link', { name: 'Aprobar el pago' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Compra confirmada' })).toBeVisible();

  await page.goto('/admin/reportes');
  await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: CAMPAIGN });
  await expect(row).toContainText('e2e');
  await expect(row.getByRole('cell').last()).toHaveText('1');
  await expectAccessible(page);
  await expectAccessibleWhenNarrow(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Descargar la conversión en CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^conversion-.*\.csv$/);
});

test('finance lists the sale, exports documents and reconciles', async ({ page }) => {
  await signIn(page, 'Finanzas UTA', '/admin/ordenes');
  await expect(page.getByRole('heading', { level: 2, name: 'Ventas' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Ventas' })).toBeVisible();
  await expectAccessible(page);
  await expectAccessibleWhenNarrow(page);

  await page.goto('/admin/documentos');
  await expect(page.getByRole('heading', { level: 1, name: 'Documentos' })).toBeVisible();
  await expectAccessible(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('documentos.xlsx');

  await page.goto('/admin/conciliacion');
  await page.getByRole('button', { name: 'Conciliar ahora' }).click();
  await expect(page.getByText(/Última conciliación:/)).toBeVisible();
  await expectAccessible(page);
});

test('the diffusion team writes a campaign and the link unsubscribes', async ({ page }) => {
  await signIn(page, 'Administración UTA', '/admin/difusion');
  await page.getByLabel('Fuente').fill('correo');
  await expect(page.getByText(/utm_source=correo/)).toBeVisible();

  await page.getByLabel('Asunto').fill(`Novedades ${CAMPAIGN}`);
  await page.getByLabel('Mensaje').fill('Tenemos nuevos cursos disponibles.');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await page.getByRole('button', { name: `Enviar novedad Novedades ${CAMPAIGN}` }).click();
  await expectAccessible(page);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Novedad en envío.')).toBeVisible();
  await expect(page.getByRole('cell', { name: `${CAMPAIGN}@example.com` })).toBeVisible();
  await expectAccessibleWhenNarrow(page);

  await page.goto(`/baja/${'0'.repeat(64)}`);
  await expect(page.getByRole('alert')).toContainText('no es válido');
  await expectAccessible(page);
});
