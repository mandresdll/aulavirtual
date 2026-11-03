import { expect, test } from '@playwright/test';

// Solo contra el stack completo (E2E_BASE_URL): `vite preview` no levanta la API.
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');

test('API is reachable through the web server and ready', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  const ready = await request.get('/api/ready');
  expect(await ready.json()).toMatchObject({ status: 'ready' });
});

test('OpenAPI documentation is published at /api/docs', async ({ page }) => {
  await page.goto('/api/docs');
  await expect(page.getByText('API Plataforma de Cursos UTA')).toBeVisible();
});
