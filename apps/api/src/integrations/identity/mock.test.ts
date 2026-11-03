import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { MockIdentityProvider } from './mock.js';

const idp = new MockIdentityProvider({ baseUrl: 'http://localhost:3000' });

function callback(params: Record<string, string>) {
  const url = new URL('http://localhost:3000/api/auth/callback');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

describe('MockIdentityProvider', () => {
  it('creates an authorization request with fresh state, nonce and PKCE verifier', async () => {
    const first = await idp.createAuthorizationRequest();
    const second = await idp.createAuthorizationRequest();
    expect(new URL(first.url).searchParams.get('state')).toBe(first.state);
    expect(first.state).not.toBe(second.state);
    expect(first.codeVerifier.length).toBeGreaterThanOrEqual(16);
  });

  it('returns the claims of the selected identity', async () => {
    const request = await idp.createAuthorizationRequest();
    const claims = await idp.completeAuthorization({
      callbackUrl: callback({ state: request.state, code: 'mock-student' }),
      expectedState: request.state,
      expectedNonce: request.nonce,
      codeVerifier: request.codeVerifier,
    });
    expect(claims).toMatchObject({ subject: 'mock-student', emailVerified: true });
  });

  it('rejects a state mismatch (CSRF) and unknown codes', async () => {
    const request = await idp.createAuthorizationRequest();
    const base = {
      expectedState: request.state,
      expectedNonce: request.nonce,
      codeVerifier: request.codeVerifier,
    };
    await expect(
      idp.completeAuthorization({
        ...base,
        callbackUrl: callback({ state: 'other', code: 'mock-student' }),
      }),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      idp.completeAuthorization({
        ...base,
        callbackUrl: callback({ state: request.state, code: 'nobody' }),
      }),
    ).rejects.toBeInstanceOf(IntegrationError);
  });
});
