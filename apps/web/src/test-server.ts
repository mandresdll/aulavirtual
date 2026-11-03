import { vi } from 'vitest';

export type Handler = (request: { method: string; url: URL; headers: Headers; body: unknown }) => {
  status?: number;
  body?: unknown;
};

/** API simulada por método y ruta; registra las llamadas para revisar cabeceras y cuerpo. */
export function mockServer(handlers: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, headers, body });
    const handler = handlers[`${method} ${url.pathname}`];
    if (handler === undefined) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' } },
        { status: 404 },
      );
    }
    const result =
      typeof handler === 'function'
        ? (handler as Handler)({ method, url, headers, body })
        : { body: handler };
    if (result.status === 204) return new Response(null, { status: 204 });
    return Response.json(result.body ?? null, { status: result.status ?? 200 });
  });
  return calls;
}
