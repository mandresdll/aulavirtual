import { defineConfig, devices } from '@playwright/test';

/**
 * E2E + accesibilidad (axe). Dos modos:
 * - `E2E_BASE_URL` definido (CI y `docker compose up`): prueba el stack completo, p. ej.
 *   http://localhost:8080.
 * - Sin `E2E_BASE_URL`: construye la SPA y la sirve con `vite preview` (sin API).
 */
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:4173',
    locale: 'es-CL',
    timezoneId: 'America/Punta_Arenas',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(admin|checkout|enrollment|payments)\.spec\.ts/,
    },
    // El panel publica cursos y el checkout reserva cupos: corren después del catálogo, que
    // verifica los cupos y conteos del seed.
    {
      name: 'stateful',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(admin|checkout|enrollment|payments)\.spec\.ts/,
      dependencies: ['chromium'],
    },
  ],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command:
            'pnpm --filter @plataforma/web build && pnpm --filter @plataforma/web preview --strictPort',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
