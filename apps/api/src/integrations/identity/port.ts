/**
 * Puerto del proveedor de identidad institucional (RF-10). Supuesto por defecto (Q2):
 * OIDC estándar con Authorization Code + PKCE. Si el IdP resulta ser SAML, se agrega
 * otro adaptador con este mismo contrato.
 */
export interface AuthorizationRequest {
  /** URL del IdP a la que se redirige al usuario. */
  url: string;
  /** Valores que la plataforma guarda en la sesión para validar el retorno. */
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface CompleteAuthorizationInput {
  /** URL completa de retorno, con `code` y `state` en la query. */
  callbackUrl: URL;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
}

export interface IdentityClaims {
  /** Identificador estable del usuario en el IdP (`sub`). */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  givenName?: string;
  familyName?: string;
}

export interface IdentityProvider {
  readonly provider: string;
  createAuthorizationRequest(): Promise<AuthorizationRequest>;
  completeAuthorization(input: CompleteAuthorizationInput): Promise<IdentityClaims>;
  /** URL de cierre de sesión en el IdP, si la ofrece. */
  getLogoutUrl(input: { postLogoutRedirectUri: string }): Promise<string | null>;
}
