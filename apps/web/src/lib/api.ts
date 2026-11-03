import { CSRF_HEADER, ErrorResponseSchema } from '@plataforma/shared';
import type { z } from 'zod';

/** Error de la API con el mensaje en español que ya entrega el servidor. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_ERROR_MESSAGE =
  'No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente.';

/**
 * Llama a la API y valida la respuesta con el esquema compartido.
 * Las cookies de sesión viajan con `credentials: 'include'`.
 */
export async function apiFetch<T extends z.ZodType>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiError(response.status, 'UNKNOWN_ERROR', NETWORK_ERROR_MESSAGE);
  }
  return schema.parse(body);
}

let csrfToken: string | null = null;

/** Token CSRF de la sesión actual; lo fija `useSession` al leer `/api/auth/session`. */
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

/**
 * Mutación (POST, PUT, DELETE) con el token CSRF de la sesión. `schema` valida la respuesta;
 * `null` para respuestas sin contenido (204).
 */
export async function apiSend<T extends z.ZodType>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  schema: T | null,
  body?: unknown,
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }
  if (response.status === 204 || schema === null) {
    if (!response.ok) await throwApiError(response);
    return null as z.infer<T>;
  }
  if (!response.ok) await throwApiError(response);
  return schema.parse(await response.json());
}

async function throwApiError(response: Response): Promise<never> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  if (parsed.success) {
    throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message);
  }
  throw new ApiError(response.status, 'UNKNOWN_ERROR', NETWORK_ERROR_MESSAGE);
}
