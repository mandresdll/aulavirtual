import { describe, expect, it } from 'vitest';
import { MockIdentityProvider } from '../identity/mock.js';
import { MOCK_IDENTITIES } from '../mock-identities.js';
import { MockSgaGateway } from './mock.js';
import { sgaContract } from './sga.contract.js';

sgaContract('mock', () => ({ sga: new MockSgaGateway(), adminSubject: 'mock-admin' }));

describe('MockSgaGateway', () => {
  const sga = new MockSgaGateway();

  it('returns profiles and platform roles for a known subject', async () => {
    expect(await sga.getUserRoles('mock-admin')).toEqual({
      sgaUserId: 'sga-0001',
      profiles: ['staff'],
      platformRoles: ['uta_admin', 'community_member'],
    });
  });

  it('returns null for an unknown subject', async () => {
    expect(await sga.getUserRoles('unknown')).toBeNull();
  });

  it('knows every identity the mock IdP can sign in', async () => {
    const idp = new MockIdentityProvider({ baseUrl: 'http://localhost:3000' });
    for (const identity of MOCK_IDENTITIES) {
      const request = await idp.createAuthorizationRequest();
      const callbackUrl = new URL('http://localhost/cb');
      callbackUrl.searchParams.set('state', request.state);
      callbackUrl.searchParams.set('code', identity.subject);
      const claims = await idp.completeAuthorization({
        callbackUrl,
        expectedState: request.state,
        expectedNonce: request.nonce,
        codeVerifier: request.codeVerifier,
      });
      expect(await sga.getUserRoles(claims.subject)).not.toBeNull();
    }
  });
});
