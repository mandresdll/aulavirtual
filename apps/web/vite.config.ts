import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.VITE_DEV_API_URL ?? 'http://localhost:3000';

// Igual que nginx en producción: /api a la API, y sitemap/robots desde sus rutas SEO.
const proxy = {
  '/api': { target: apiTarget, changeOrigin: false },
  '/sitemap.xml': { target: apiTarget, rewrite: () => '/api/seo/sitemap.xml' },
  '/robots.txt': { target: apiTarget, rewrite: () => '/api/seo/robots.txt' },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Usa el código fuente de shared: HMR inmediato y sin depender de su build.
    alias: {
      '@plataforma/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
