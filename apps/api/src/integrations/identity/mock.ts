import { randomBytes } from 'node:crypto';
import { IntegrationError } from '../errors.js';
import { MOCK_IDENTITIES, type MockIdentity } from '../mock-identities.js';
import type {
  AuthorizationRequest,
  CompleteAuthorizationInput,
  IdentityClaims,
  IdentityProvider,
} from './port.js';

const random = () => randomBytes(16).toString('base64url');

/**
 * IdP simulado. La página de selección de usuario es `/api/dev/mock-idp/authorize`
 * (`modules/auth/mock-idp.routes.ts`); el `code` devuelto es el `subject` de una identidad de
 * `MOCK_IDENTITIES`. `baseUrl` es la URL pública de la SPA, que reenvía `/api` a la API.
 */
export class MockIdentityProvider implements IdentityProvider {
  readonly provider = 'mock';

  constructor(
    private readonly options: { baseUrl: string; identities?: readonly MockIdentity[] },
  ) {}

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    const state = random();
    const nonce = random();
    const url = new URL('/api/dev/mock-idp/authorize', this.options.baseUrl);
    url.searchParams.set('state', state);
    return { url: url.toString(), state, nonce, codeVerifier: random() };
  }

  async completeAuthorization(input: CompleteAuthorizationInput): Promise<IdentityClaims> {
    const params = input.callbackUrl.searchParams;
    if (params.get('state') !== input.expectedState) {
      throw new IntegrationError('identity', 'STATE_MISMATCH', 'OIDC state mismatch');
    }
    const code = params.get('code');
    const identity = (this.options.identities ?? MOCK_IDENTITIES).find(
      (item) => item.subject === code,
    );
    if (!identity) {
      throw new IntegrationError('identity', 'INVALID_CODE', 'Unknown authorization code');
    }
    return {
      subject: identity.subject,
      email: identity.email,
      emailVerified: true,
      name: identity.name,
      givenName: identity.givenName,
      familyName: identity.familyName,
    };
  }

  async getLogoutUrl(): Promise<string | null> {
    return null;
  }
}
