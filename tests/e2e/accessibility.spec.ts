import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Criterios WCAG 2.1 nivel A y AA que exige la ficha (RNF accesibilidad). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Anchos que exige la ficha (RF-01). */
const WIDTHS = [360, 768, 1280];

/** Páginas públicas a revisar. Cada fase agrega las suyas (catálogo, ficha, checkout…). */
const PUBLIC_PAGES = [
  { name: 'inicio', path: '/' },
  { name: 'catálogo', path: '/cursos' },
  { name: 'catálogo filtrado', path: '/cursos?q=programacion&modality=online' },
  { name: 'ficha de curso', path: '/cursos/programacion-web-con-javascript' },
  { name: 'ficha de curso sin cupos', path: '/cursos/ciberseguridad-para-el-trabajo' },
  { name: 'curso inexistente', path: '/cursos/no-existe' },
  { name: 'página no encontrada', path: '/no-existe' },
  { name: 'ingreso', path: '/ingresar?error=cancelado' },
  { name: 'carrito vacío', path: '/carrito' },
  { name: 'términos y condiciones', path: '/legal/terminos' },
  { name: 'verificación de certificado', path: '/verificar' },
  { name: 'certificado válido', path: '/verificar/DEM0-CERT-0001' },
  { name: 'certificado inexistente', path: '/verificar/AAAA-AAAA-AAAA' },
  { name: 'privacidad', path: '/legal/privacidad' },
  { name: 'derecho de retracto', path: '/legal/retracto' },
  { name: 'devoluciones', path: '/legal/devoluciones' },
  { name: 'baja de novedades', path: `/baja/${'0'.repeat(64)}` },
];

for (const page of PUBLIC_PAGES) {
  test(`${page.name} has no WCAG 2.1 AA violations`, async ({ page: browserPage }) => {
    await browserPage.goto(page.path);
    await expect(browserPage.getByRole('heading', { level: 1 })).toBeVisible();
    // Se revisa la página ya cargada (resultados o mensaje de error), no el estado "Cargando".
    await browserPage.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page: browserPage }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const page of PUBLIC_PAGES) {
      test(`${page.name} fits the screen and stays accessible`, async ({ page: browserPage }) => {
        await browserPage.goto(page.path);
        await expect(browserPage.getByRole('heading', { level: 1 })).toBeVisible();
        await browserPage.waitForLoadState('networkidle');
        const overflow = await browserPage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        const results = await new AxeBuilder({ page: browserPage }).withTags(WCAG_TAGS).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}

test('the keyboard reaches the skip link first and it moves the focus', async ({ page }) => {
  await page.goto('/cursos');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido principal' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenido$/);
});
