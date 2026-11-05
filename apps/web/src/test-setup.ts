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

// Node 22+ define un `localStorage` global propio que en jsdom puede quedar sin implementar.
// Se usa un almacenamiento en memoria equivalente.
if (typeof window.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
}
