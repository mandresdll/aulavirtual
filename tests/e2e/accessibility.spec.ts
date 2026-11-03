import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Criterios WCAG 2.1 nivel A y AA que exige la ficha (RNF accesibilidad). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Páginas públicas a revisar. Cada fase agrega las suyas (catálogo, ficha, checkout…). */
const PUBLIC_PAGES = [
  { name: 'inicio', path: '/' },
  { name: 'página no encontrada', path: '/no-existe' },
];

for (const page of PUBLIC_PAGES) {
  test(`${page.name} has no WCAG 2.1 AA violations`, async ({ page: browserPage }) => {
    await browserPage.goto(page.path);
    await expect(browserPage.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page: browserPage }).withTags(WCAG_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
}
