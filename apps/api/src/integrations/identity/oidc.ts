import { AdapterNotImplementedError } from '../errors.js';
import type {
  AuthorizationRequest,
  CompleteAuthorizationInput,
  IdentityClaims,
  IdentityProvider,
} from './port.js';

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

/**
 * Adaptador OIDC (`openid-client`, Authorization Code + PKCE) para el IdP del SGA.
 * Se implementa en la Fase 2.
 */
export class OidcIdentityProvider implements IdentityProvider {
  readonly provider = 'oidc';

  constructor(readonly config: OidcConfig) {}

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    throw this.notYet();
  }

  async completeAuthorization(_input: CompleteAuthorizationInput): Promise<IdentityClaims> {
    throw this.notYet();
  }

  async getLogoutUrl(_input: { postLogoutRedirectUri: string }): Promise<string | null> {
    throw this.notYet();
  }

  private notYet() {
    return new AdapterNotImplementedError('identity', 'OIDC se implementa en la Fase 2');
  }
}
