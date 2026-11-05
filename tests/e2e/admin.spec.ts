import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Identidad y panel de administración (RF-10, RF-07, RF-12) con el IdP y el SGA simulados.
 * Solo contra el stack completo (E2E_BASE_URL): necesita la API, Redis y PostgreSQL.
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Ingresa por el flujo real: página protegida → /ingresar → IdP simulado → vuelta. */
async function loginAs(page: Page, name: string, path = '/admin') {
  await page.goto(path);
  await expect(page).toHaveURL(/\/ingresar\?returnTo=/);
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Proveedor de identidad simulado' }),
  ).toBeVisible();
  await page.getByRole('link', { name }).click();
  await expect(page).toHaveURL(path);
}

/** Mensaje de resultado (puede haber más de uno visible: curso y ediciones). */
async function expectStatus(page: Page, text: string) {
  await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();
}

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test('login with the institutional account (mock) and logout', async ({ page, context }) => {
  await loginAs(page, 'Editora UTA');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Panel de administración' }),
  ).toBeVisible();
  await expect(page.getByText('Editora UTA', { exact: true })).toBeVisible();

  const cookies = await context.cookies();
  const sid = cookies.find((cookie) => cookie.name === '__Host-sid');
  expect(sid).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/ingresar/);
});

test('a cancelled login explains what happened', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL('/ingresar?error=cancelado');
  await expect(page.getByRole('alert')).toContainText('Cancelaste el inicio de sesión');
});

test('community members cannot enter the panel', async ({ page }) => {
  await loginAs(page, 'Estudiante de Prueba');
  await expect(page.getByRole('heading', { level: 1, name: 'Acceso no autorizado' })).toBeVisible();
  const response = await page.request.get('/api/admin/courses');
  expect(response.status()).toBe(403);
});

test('an editor manages a course from creation to the public catalog', async ({ page }) => {
  // Valores únicos por ejecución: la BD del stack se conserva entre reintentos.
  const suffix = Date.now().toString(36);
  const slug = `curso-e2e-${suffix}`;
  const title = `Curso E2E ${suffix}`;
  const code = `E2E-${suffix.toUpperCase()}`;

  await loginAs(page, 'Editora UTA', '/admin/areas');

  // Área y docente.
  await page.getByRole('button', { name: 'Nueva área' }).click();
  const areaForm = page.getByRole('form', { name: 'Nueva área' });
  await areaForm.getByLabel('Nombre', { exact: true }).fill(`Área ${suffix}`);
  await areaForm.getByLabel(/slug/).fill(`area-${suffix}`);
  await areaForm.getByRole('button', { name: 'Guardar área' }).click();
  await expectStatus(page, 'Se guardó el área');
  await expectAccessible(page);

  await page
    .getByRole('navigation', { name: 'Secciones del panel' })
    .getByRole('link', { name: 'Docentes' })
    .click();
  await page.getByRole('button', { name: 'Nuevo docente' }).click();
  const instructorForm = page.getByRole('form', { name: 'Nuevo docente' });
  await instructorForm.getByLabel('Nombre', { exact: true }).fill(`Docente ${suffix}`);
  await instructorForm.getByRole('button', { name: 'Guardar docente' }).click();
  await expectStatus(page, 'Se guardó');

  // Curso.
  await page
    .getByRole('navigation', { name: 'Secciones del panel' })
    .getByRole('link', { name: 'Cursos' })
    .click();
  await page.getByRole('link', { name: 'Nuevo curso' }).click();
  const courseForm = page.getByRole('form', { name: 'Datos del curso' });
  await courseForm.getByLabel('Título', { exact: true }).fill(title);
  await courseForm.getByLabel(/slug/).fill(slug);
  await courseForm.getByLabel('Área', { exact: true }).selectOption({ label: `Área ${suffix}` });
  await courseForm.getByLabel('Duración (horas)').fill('16');
  await courseForm.getByLabel('Resumen', { exact: true }).fill('Curso creado por la prueba E2E.');
  await courseForm
    .getByLabel('Descripción', { exact: true })
    .fill('Descripción del curso de prueba.');
  await courseForm
    .getByLabel('Objetivos', { exact: true })
    .fill('Primer objetivo\nSegundo objetivo');
  await courseForm.getByLabel(`Docente ${suffix}`).check();
  await courseForm.getByRole('button', { name: 'Crear curso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  await expectAccessible(page);

  // Edición con fechas futuras (hora de Punta Arenas).
  const local = (days: number) => {
    const date = new Date(Date.now() + days * 86_400_000);
    return `${date.toISOString().slice(0, 10)}T18:00`;
  };
  await page.getByRole('button', { name: 'Nueva edición' }).click();
  const editionForm = page.getByRole('form', { name: 'Nueva edición' });
  await editionForm.getByLabel('Código', { exact: true }).fill(code);
  await editionForm.getByLabel('Cupos', { exact: true }).fill('15');
  await editionForm.getByLabel('Precio (CLP)').fill('45000');
  await editionForm.getByLabel('Inicio', { exact: true }).fill(local(30));
  await editionForm.getByLabel('Término', { exact: true }).fill(local(60));
  await editionForm.getByLabel('Cierre de inscripciones', { exact: true }).fill(local(20));
  await editionForm.getByRole('button', { name: 'Guardar edición' }).click();
  await expectStatus(page, `Se guardó la edición ${code}`);

  await page.getByRole('button', { name: `Publicar edición ${code}` }).click();
  await expectStatus(page, 'La edición está publicada');
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expectStatus(page, 'publicado en el catálogo');

  // El catálogo público lo muestra de inmediato (caché invalidada).
  await page.goto(`/cursos/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('$45.000').first()).toBeVisible();
  await expect(page.getByText(`Docente ${suffix}`)).toBeVisible();

  // Duplicar la edición y archivar el curso.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.getByRole('button', { name: `Duplicar edición ${code}` }).click();
  await page.getByLabel(`Código de la copia de ${code}`).fill(`${code}-2`);
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await expectStatus(page, 'Se creó la copia como borrador');
  await expect(page.getByRole('cell', { name: new RegExp(`^${code}-2`) })).toBeVisible();
  await expect(page.getByText('Sin curso del Aula Virtual').first()).toBeVisible();

  await page.getByRole('button', { name: 'Archivar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archivar curso' }).click();
  await expectStatus(page, 'archivado');
  // La API deja de entregarlo (el navegador puede conservar la ficha hasta 15 s: max-age).
  expect((await page.request.get(`/api/catalog/courses/${slug}`)).status()).toBe(404);
});

test('the administrator reviews the read-only audit log', async ({ page }) => {
  await loginAs(page, 'Administración UTA', '/admin/auditoria');
  await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
  await page.getByLabel('Acción').selectOption({ label: 'Inicio de sesión' });
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/action=auth.login/);
  await expect(page.getByRole('cell', { name: 'Inicio de sesión' }).first()).toBeVisible();
  await expectAccessible(page);
});

test('editors do not see the audit log', async ({ page }) => {
  await loginAs(page, 'Editora UTA');
  const nav = page.getByRole('navigation', { name: 'Secciones del panel' });
  await expect(nav.getByRole('link', { name: 'Cursos' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);
  expect((await page.request.get('/api/admin/audit')).status()).toBe(403);
});
