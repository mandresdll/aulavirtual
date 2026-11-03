import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { HttpSgaGateway } from './http.js';
import { sgaContract } from './sga.contract.js';

const BASE_URL = 'https://sga.example.cl/api/v1';
const TOKEN = 'service-token';

/** SGA falso con el contrato supuesto (Q7): `GET /users/{subject}/roles` con token Bearer. */
function fakeSga(overrides: Partial<Record<string, () => Response>> = {}): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = new Headers(init?.headers);
    if (headers.get('authorization') !== `Bearer ${TOKEN}`) {
      return new Response(null, { status: 401 });
    }
    const override = overrides[url.pathname];
    if (override) return override();
    if (url.pathname === '/api/v1/users/sub-admin/roles') {
      return Response.json({
        sgaUserId: 'SGA-77',
        profiles: ['staff', 'alumni'],
        roles: ['uta_admin', 'community_member', 'sga_superuser'],
      });
    }
    return new Response(null, { status: 404 });
  };
}

sgaContract('http (fake SGA)', () => ({
  sga: new HttpSgaGateway({ baseUrl: BASE_URL, token: TOKEN, fetch: fakeSga() }),
  adminSubject: 'sub-admin',
}));

describe('HttpSgaGateway', () => {
  it('drops profiles and roles the platform does not know (deny by default)', async () => {
    const sga = new HttpSgaGateway({ baseUrl: BASE_URL, token: TOKEN, fetch: fakeSga() });
    expect(await sga.getUserRoles('sub-admin')).toEqual({
      sgaUserId: 'SGA-77',
      profiles: ['staff'],
      platformRoles: ['uta_admin', 'community_member'],
    });
  });

  it('encodes the subject in the path', async () => {
    let requested = '';
    const sga = new HttpSgaGateway({
      baseUrl: `${BASE_URL}/`,
      token: TOKEN,
      fetch: async (input) => {
        requested = input.toString();
        return new Response(null, { status: 404 });
      },
    });
    await sga.getUserRoles('a/b?c');
    expect(requested).toBe(`${BASE_URL}/users/a%2Fb%3Fc/roles`);
  });

  it('reports server errors as retryable and bad answers as definitive', async () => {
    const failing = new HttpSgaGateway({
      baseUrl: BASE_URL,
      token: TOKEN,
      fetch: fakeSga({ '/api/v1/users/x/roles': () => new Response(null, { status: 503 }) }),
    });
    await expect(failing.getUserRoles('x')).rejects.toMatchObject({ retryable: true });

    const invalid = new HttpSgaGateway({
      baseUrl: BASE_URL,
      token: TOKEN,
      fetch: fakeSga({ '/api/v1/users/x/roles': () => Response.json({ roles: 'admin' }) }),
    });
    await expect(invalid.getUserRoles('x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const unauthorized = new HttpSgaGateway({ baseUrl: BASE_URL, token: 'otro', fetch: fakeSga() });
    await expect(unauthorized.getUserRoles('sub-admin')).rejects.toBeInstanceOf(IntegrationError);
  });

  it('reports a network failure as retryable', async () => {
    const sga = new HttpSgaGateway({
      baseUrl: BASE_URL,
      token: TOKEN,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(sga.getUserRoles('x')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      retryable: true,
    });
  });
});
