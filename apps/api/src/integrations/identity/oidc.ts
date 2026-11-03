import * as oidc from 'openid-client';
import { IntegrationError } from '../errors.js';
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
  /** Solo pruebas: permite un IdP por http (el emisor falso de las pruebas). */
  allowInsecureRequests?: boolean;
}

/**
 * Adaptador OIDC (`openid-client`, Authorization Code + PKCE S256) para el IdP del SGA (Q2).
 * La configuración del IdP se descubre una vez (`/.well-known/openid-configuration`) y se
 * reutiliza; si el descubrimiento falla, se reintenta en el siguiente inicio de sesión.
 */
export class OidcIdentityProvider implements IdentityProvider {
  readonly provider = 'oidc';
  private configuration: Promise<oidc.Configuration> | undefined;

  constructor(readonly config: OidcConfig) {}

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    const configuration = await this.discover();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const url = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes,
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
    return { url: url.toString(), state, nonce, codeVerifier };
  }

  async completeAuthorization(input: CompleteAuthorizationInput): Promise<IdentityClaims> {
    const configuration = await this.discover();
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(configuration, input.callbackUrl, {
        pkceCodeVerifier: input.codeVerifier,
        expectedState: input.expectedState,
        expectedNonce: input.expectedNonce,
        idTokenExpected: true,
      });
    } catch (error) {
      throw new IntegrationError(
        'identity',
        'AUTHORIZATION_FAILED',
        'OIDC code exchange failed',
        false,
        {
          cause: error,
        },
      );
    }

    const claims = tokens.claims();
    if (!claims) {
      throw new IntegrationError('identity', 'MISSING_ID_TOKEN', 'The IdP returned no ID token');
    }
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    if (!email) {
      throw new IntegrationError('identity', 'MISSING_EMAIL', 'The ID token has no email claim');
    }
    const text = (value: unknown) =>
      typeof value === 'string' && value !== '' ? value : undefined;
    const givenName = text(claims.given_name);
    const familyName = text(claims.family_name);
    return {
      subject: claims.sub,
      email,
      emailVerified: claims.email_verified === true,
      name: text(claims.name) ?? ([givenName, familyName].filter(Boolean).join(' ') || email),
      ...(givenName ? { givenName } : {}),
      ...(familyName ? { familyName } : {}),
      ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
    };
  }

  async getLogoutUrl(input: {
    postLogoutRedirectUri: string;
    idTokenHint?: string;
  }): Promise<string | null> {
    const configuration = await this.discover();
    if (!configuration.serverMetadata().end_session_endpoint) return null;
    return oidc
      .buildEndSessionUrl(configuration, {
        post_logout_redirect_uri: input.postLogoutRedirectUri,
        ...(input.idTokenHint ? { id_token_hint: input.idTokenHint } : {}),
      })
      .toString();
  }

  private discover(): Promise<oidc.Configuration> {
    this.configuration ??= oidc
      .discovery(
        new URL(this.config.issuerUrl),
        this.config.clientId,
        undefined,
        oidc.ClientSecretPost(this.config.clientSecret),
        this.config.allowInsecureRequests ? { execute: [oidc.allowInsecureRequests] } : undefined,
      )
      .catch((error: unknown) => {
        this.configuration = undefined;
        throw new IntegrationError('identity', 'DISCOVERY_FAILED', 'OIDC discovery failed', true, {
          cause: error,
        });
      });
    return this.configuration;
  }
}
