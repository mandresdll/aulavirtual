import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Carrito, cupones, textos legales y checkout (RF-03, RF-04, RF-11) con los datos de
 * demostración. Solo contra el stack completo (E2E_BASE_URL). Crea órdenes que reservan
 * cupos: corre después de las pruebas del catálogo (proyecto `stateful`).
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function signInFromLoginPage(page: Page, name: string) {
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name }).click();
}

async function acceptLegalAndConfirm(page: Page, button: string) {
  const form = page.getByRole('form', { name: 'Datos de la compra' });
  for (const box of await form.getByRole('checkbox').all()) await box.check();
  await form.getByRole('button', { name: button }).click();
}

test('a visitor fills the cart, signs in, applies a coupon and creates the order', async ({
  page,
}) => {
  // Carrito sin sesión (navegador).
  await page.goto('/cursos/excel-para-la-gestion');
  await page.getByRole('button', { name: 'Agregar al carrito la edición XLS-DEMO-1' }).click();
  await expect(page.getByRole('link', { name: 'Carrito (1)' })).toBeVisible();
  await page.getByRole('link', { name: 'Carrito (1)' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Carrito' })).toBeVisible();
  await expect(page.getByText('$45.000', { exact: true }).first()).toBeVisible();
  await expectAccessible(page);

  // Para pagar se ingresa; el carrito del navegador pasa a la cuenta.
  await page.getByRole('link', { name: 'Ingresar para comprar' }).click();
  await signInFromLoginPage(page, 'Docente de Prueba');
  await expect(page).toHaveURL('/checkout');
  await expect(page.getByRole('heading', { level: 1, name: 'Confirmar compra' })).toBeVisible();
  await expect(page.getByText('Excel para la gestión')).toBeVisible();

  // Cupón del seed: 10 %.
  await page.getByLabel('Cupón de descuento').fill('bienvenida10');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Cupón BIENVENIDA10 aplicado: 10 % de descuento.')).toBeVisible();
  await expect(page.getByText('$40.500')).toBeVisible();
  await expectAccessible(page);

  // Las casillas legales no vienen marcadas y son obligatorias.
  const form = page.getByRole('form', { name: 'Datos de la compra' });
  await form.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(form.getByText('Debes aceptar este documento')).toHaveCount(4);

  await acceptLegalAndConfirm(page, 'Confirmar compra');
  await expect(page).toHaveURL(/\/ordenes\/UTA-\d{4}-\d{6}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Orden creada' })).toBeVisible();
  await expect(page.getByText('Esperando pago')).toBeVisible();
  await expect(page.getByText(/Tus cupos están reservados hasta/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carrito (0)' })).toBeVisible();
  await expectAccessible(page);
});

test('a 100 % scholarship coupon confirms the enrollment without payment', async ({ page }) => {
  await page.goto('/cursos/emprendimiento-digital-en-magallanes');
  await page.getByRole('button', { name: 'Agregar al carrito la edición EMP-DEMO-1' }).click();
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/ingresar\?returnTo=%2Fcheckout/);
  await signInFromLoginPage(page, 'Estudiante de Prueba');
  await expect(page).toHaveURL('/checkout');

  await page.getByLabel('Cupón de descuento').fill('BECA-UTA-100');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText(/Cupón BECA-UTA-100 aplicado/)).toBeVisible();
  await acceptLegalAndConfirm(page, 'Confirmar inscripción');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Inscripción confirmada' }),
  ).toBeVisible();
  await expect(page.getByText('Pagada')).toBeVisible();
});

test('legal texts are public, versioned and linked from the footer', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Información legal' })
    .getByRole('link', { name: 'Derecho de retracto' })
    .click();
  await expect(page).toHaveURL('/legal/retracto');
  await expect(page.getByRole('heading', { level: 1, name: 'Derecho de retracto' })).toBeVisible();
  await expect(page.getByText(/Versión 2026\.0-borrador/)).toBeVisible();
  await expect(page.getByText('10 días', { exact: true })).toBeVisible();
  await expectAccessible(page);
});

test('finance staff create a coupon from the panel', async ({ page }) => {
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
  await page.goto('/admin/cupones');
  await signInFromLoginPage(page, 'Finanzas UTA');
  await expect(page.getByRole('heading', { level: 1, name: 'Cupones' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Secciones del panel' });
  await expect(nav.getByRole('link', { name: 'Cursos' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Nuevo cupón' }).click();
  const form = page.getByRole('form', { name: 'Nuevo cupón' });
  await form.getByLabel('Código', { exact: true }).fill(code);
  await form.getByLabel('Porcentaje').fill('20');
  await form.getByLabel('Motivo').selectOption({ label: 'Convenio' });
  await form.getByRole('button', { name: 'Guardar cupón' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Se guardó el cupón ${code}` }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(`^${code}`) })).toBeVisible();
  await expectAccessible(page);
});
