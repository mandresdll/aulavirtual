import { defineConfig, devices } from '@playwright/test';

/**
 * Genera las capturas de los manuales sobre los datos de demostración, contra un stack ya levantado:
 * `E2E_BASE_URL=http://localhost:8080 pnpm docs:capturas`. No es parte de las pruebas.
 */
export default defineConfig({
  testDir: '.',
  workers: 1,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    viewport: { width: 1280, height: 800 },
    locale: 'es-CL',
    timezoneId: 'America/Punta_Arenas',
  },
});
