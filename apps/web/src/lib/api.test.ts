import { HealthResponseSchema } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiFetch', () => {
  it('parses successful responses with the shared schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ status: 'ok', version: '1', time: '2026-11-03T12:00:00.000Z' }, 200),
    );
    await expect(apiFetch('/api/health', HealthResponseSchema)).resolves.toMatchObject({
      status: 'ok',
    });
  });

  it('surfaces the Spanish message of API errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { code: 'FORBIDDEN', message: 'No tienes permisos.' } }, 403),
    );
    await expect(apiFetch('/api/x', HealthResponseSchema)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'No tienes permisos.',
    });
  });

  it('turns network failures into a friendly ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await apiFetch('/api/x', HealthResponseSchema).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
  });
});
