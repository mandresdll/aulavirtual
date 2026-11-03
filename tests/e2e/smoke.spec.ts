import { expect, test } from '@playwright/test';

test('home page loads in Spanish with a single main heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-CL');
  await expect(page).toHaveTitle(/Cursos UTA/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Ver todos los cursos' })).toBeVisible();
});

test('skip link moves keyboard focus to the main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido principal' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenido$/);
});

test('admin area is loaded on demand as a separate chunk', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/assets/AdminApp')) chunks.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(chunks).toHaveLength(0);

  // Sin sesión lleva a /ingresar (stack completo) o informa que la API no responde (preview).
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { level: 1, name: /Ingresar|Panel de administración/ }),
  ).toBeVisible();
  expect(chunks).not.toHaveLength(0);
});

// RF-01: responsive en 360, 768 y 1280 px. Sin API (vite preview) se revisan los estados de error.
const RESPONSIVE_PAGES = ['/', '/cursos', '/cursos/programacion-web-con-javascript'];

for (const width of [360, 768, 1280]) {
  for (const path of RESPONSIVE_PAGES) {
    test(`${path} has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
