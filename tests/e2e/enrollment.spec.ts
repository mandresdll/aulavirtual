import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Inscripción liberada y lista de espera (RF-04, RF-05) sobre los datos de demostración. Solo
 * contra el stack completo (E2E_BASE_URL). Cambia inscripciones: corre en el proyecto `stateful`.
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

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

test('community staff enroll for free in a released edition', async ({ page }) => {
  await signIn(page, 'Editora UTA', '/cursos/emprendimiento-digital-en-magallanes');
  await page
    .getByRole('button', { name: 'Inscribirme sin costo en la edición EMP-DEMO-1' })
    .click();
  await expect(page.getByText('Ya estás inscrito en esta edición.')).toBeVisible();
  await expectAccessible(page);
});

test('people join and leave the waitlist of a full edition', async ({ page }) => {
  await signIn(page, 'Administración UTA', '/cursos/ciberseguridad-para-el-trabajo');
  await page
    .getByRole('button', { name: 'Unirme a la lista de espera de la edición SEG-DEMO-1' })
    .click();
  await expect(page.getByText(/Estás en la lista de espera \(lugar 1\)/)).toBeVisible();
  await expectAccessible(page);

  await page.goto('/admin/inscripciones');
  await expect(page.getByRole('heading', { level: 1, name: 'Inscripciones' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /SEG-DEMO-1/ })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/cursos/ciberseguridad-para-el-trabajo');
  await page
    .getByRole('button', { name: 'Salir de la lista de espera de la edición SEG-DEMO-1' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Unirme a la lista de espera de la edición SEG-DEMO-1' }),
  ).toBeVisible();
});

test('visitors are invited to sign in to join the waitlist', async ({ page }) => {
  await page.goto('/cursos/ciberseguridad-para-el-trabajo');
  await expect(
    page.getByRole('link', { name: 'Ingresa para unirte a la lista de espera' }),
  ).toBeVisible();
});
