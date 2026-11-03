import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Criterios WCAG 2.1 nivel A y AA que exige la ficha (RNF accesibilidad). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

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
