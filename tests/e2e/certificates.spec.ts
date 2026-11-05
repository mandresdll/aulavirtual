import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Verificación, «Mis cursos» y gestión de certificados (RF-06) sobre el certificado de
 * demostración. Solo contra el stack completo (E2E_BASE_URL). Lo reemite y lo revoca: corre en el
 * proyecto `stateful`, después de la revisión de accesibilidad de `/verificar`.
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');
// La segunda prueba reemite y revoca el certificado que descarga la primera.
test.describe.configure({ mode: 'serial' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DEMO_CODE = 'DEM0-CERT-0001';

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function signIn(page: Page, name: string, path: string) {
  await page.goto(`/ingresar?returnTo=${encodeURIComponent(path)}`);
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name }).click();
  await expect(page).toHaveURL(path);
}

test('the owner finds the course and downloads the certificate', async ({ page }) => {
  await signIn(page, 'Docente de Prueba', '/mis-cursos');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis cursos' })).toBeVisible();
  const link = page.getByRole('link', { name: 'Descargar certificado (PDF)' });
  await expect(link).toBeVisible();
  await expectAccessible(page);

  const response = await page.request.get((await link.getAttribute('href')) ?? '');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
});

test('anyone verifies by code, and the panel reissues and revokes', async ({ page }) => {
  await page.goto('/verificar');
  await page.getByLabel('Código del certificado').fill(DEMO_CODE.toLowerCase());
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('Certificado válido')).toBeVisible();

  await signIn(page, 'Administración UTA', '/admin/certificados');
  await expect(page.getByRole('heading', { level: 1, name: 'Certificados' })).toBeVisible();
  await page.getByLabel('Código, correo o nombre').fill(DEMO_CODE);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: `Reemitir certificado ${DEMO_CODE}` }).click();
  await expectAccessible(page);
  await page.getByLabel('Nombre corregido').fill('Nombre Corregido Demo');
  await page.getByRole('button', { name: 'Reemitir', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reemitir' }).click();
  const done = page.getByRole('status').filter({ hasText: 'reemitido con el código' });
  await expect(done).toBeVisible();
  const newCode = /[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.exec((await done.textContent()) ?? '')?.[0];
  expect(newCode).toBeTruthy();

  await page.goto(`/verificar/${DEMO_CODE}`);
  await expect(page.getByText('Certificado reemplazado')).toBeVisible();
  await page.getByRole('link', { name: newCode as string }).click();
  await expect(page.getByText('Nombre Corregido Demo')).toBeVisible();

  await page.goto(`/admin/certificados?q=${newCode as string}`);
  await page.getByRole('button', { name: `Revocar certificado ${newCode as string}` }).click();
  await page.getByLabel('Motivo de la revocación').fill('Prueba de revocación');
  await page.getByRole('button', { name: 'Revocar', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revocar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'revocado' })).toBeVisible();

  await page.goto(`/verificar/${newCode as string}`);
  await expect(page.getByText('Certificado revocado')).toBeVisible();
  await expectAccessible(page);
});
