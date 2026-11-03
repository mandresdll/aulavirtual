import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    // Las pruebas usan el código fuente de shared para no depender de su build.
    alias: { '@plataforma/shared': sharedSrc },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.contract.ts', 'src/server.ts', 'src/worker.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
});
