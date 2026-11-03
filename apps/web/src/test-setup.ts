import { z } from 'zod';
import es from 'zod/v4/locales/es.js';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

z.config(es());

// React Router crea un `Request` con la señal de aborto de jsdom en cada navegación, y el
// `Request` de Node solo acepta su propia `AbortSignal`. En pruebas se omite la señal.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const rest: RequestInit = { ...init };
    delete rest.signal;
    super(input, rest);
  }
} as typeof Request;
