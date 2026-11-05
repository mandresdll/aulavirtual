import { expect, test, type Page } from '@playwright/test';

const COURSE = 'programacion-web-con-javascript';

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `docs/img/${name}.png`, fullPage });
}

async function signIn(page: Page, name: string, path: string) {
  await page.goto(`/ingresar?returnTo=${encodeURIComponent(path)}`);
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name }).click();
  await expect(page).toHaveURL(path);
}

test('manual del comprador', async ({ page }) => {
  await page.goto('/');
  await shot(page, 'comprador-portada');
  await page.goto('/cursos');
  await shot(page, 'comprador-catalogo');
  await page.goto(`/cursos/${COURSE}`);
  await page
    .getByRole('button', { name: /Agregar al carrito/ })
    .first()
    .scrollIntoViewIfNeeded();
  await shot(page, 'comprador-ficha');
  await page
    .getByRole('button', { name: /Agregar al carrito/ })
    .first()
    .click();
  await expect(page.getByText('Está en tu carrito.')).toBeVisible();
  await page.goto('/carrito');
  await shot(page, 'comprador-carrito');
  await page.goto('/checkout');
  await page.getByRole('link', { name: 'Ingresar con cuenta institucional' }).click();
  await page.getByRole('link', { name: 'Finanzas UTA' }).click();
  await expect(page).toHaveURL('/checkout');
  const form = page.getByRole('form', { name: 'Datos de la compra' });
  await expect(form.getByRole('checkbox')).toHaveCount(4);
  await shot(page, 'comprador-checkout', true);
  for (const box of await form.getByRole('checkbox').all()) await box.check();
  await form.getByRole('button', { name: 'Confirmar compra' }).click();
  await page.getByRole('button', { name: /^Pagar \$/ }).click();
  await page.getByRole('link', { name: 'Aprobar el pago' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Compra confirmada' })).toBeVisible();
  await shot(page, 'comprador-orden');
  await page.goto('/verificar/DEM0-CERT-0001');
  await expect(page.getByText('Certificado válido')).toBeVisible();
  await shot(page, 'comprador-verificar');
});

test('mis cursos', async ({ page }) => {
  await signIn(page, 'Docente de Prueba', '/mis-cursos');
  await expect(page.getByRole('link', { name: /Descargar certificado/ })).toBeVisible();
  await shot(page, 'comprador-mis-cursos');
});

test('manual de administración', async ({ page }) => {
  await signIn(page, 'Administración UTA', '/admin');
  await shot(page, 'admin-inicio');
  const pages: [string, string][] = [
    ['/admin/cursos', 'admin-cursos'],
    ['/admin/inscripciones', 'admin-inscripciones'],
    ['/admin/certificados', 'admin-certificados'],
    ['/admin/cupones', 'admin-cupones'],
    ['/admin/ordenes', 'admin-ventas'],
    ['/admin/documentos', 'admin-documentos'],
    ['/admin/conciliacion', 'admin-conciliacion'],
    ['/admin/reportes', 'admin-reportes'],
    ['/admin/difusion', 'admin-difusion'],
    ['/admin/configuracion', 'admin-configuracion'],
    ['/admin/privacidad', 'admin-privacidad'],
    ['/admin/legales', 'admin-legales'],
    ['/admin/auditoria', 'admin-auditoria'],
  ];
  for (const [path, name] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shot(page, name);
  }
  await page.goto('/admin/cursos');
  await page.getByRole('link', { name: 'Excel para la gestión' }).first().click();
  await expect(page.getByRole('form', { name: 'Datos del curso' })).toBeVisible();
  await shot(page, 'admin-curso-edicion');
});
