import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import { OidcIdentityProvider } from './oidc.js';

/**
 * Emisor OIDC falso dentro de la prueba: valida PKCE y el secreto del cliente en el endpoint
 * de token y firma el ID Token con RS256, como un IdP real.
 */
const CLIENT_ID = 'plataforma-cursos';
const CLIENT_SECRET = 'test-secret';
const REDIRECT_URI = 'https://cursos.example.cl/api/auth/callback';

interface PendingCode {
  challenge: string;
  nonce: string;
}

let server: Server;
let issuer: string;
let privateKey: CryptoKey;
const codes = new Map<string, PendingCode>();

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', issuer);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        end_session_endpoint: `${issuer}/logout`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });
    if (url.pathname === '/token' && request.method === 'POST') {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        void (async () => {
          const form = new URLSearchParams(raw);
          const pending = codes.get(form.get('code') ?? '');
          if (form.get('client_secret') !== CLIENT_SECRET) {
            return json(401, { error: 'invalid_client' });
          }
          const verifier = form.get('code_verifier') ?? '';
          const challenge = createHash('sha256').update(verifier).digest('base64url');
          if (!pending || pending.challenge !== challenge) {
            return json(400, { error: 'invalid_grant' });
          }
          if (form.get('redirect_uri') !== REDIRECT_URI) {
            return json(400, { error: 'invalid_grant' });
          }
          const idToken = await new SignJWT({
            nonce: pending.nonce,
            email: 'docente@cftmagallanes.cl',
            email_verified: true,
            given_name: 'Camila',
            family_name: 'Vidal',
          })
            .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
            .setIssuer(issuer)
            .setAudience(CLIENT_ID)
            .setSubject('idp-user-123')
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);
          json(200, {
            access_token: 'at',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: idToken,
          });
        })();
      });
      return;
    }
    json(404, { error: 'not_found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function provider() {
  return new OidcIdentityProvider({
    issuerUrl: issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    scopes: 'openid profile email',
    allowInsecureRequests: true,
  });
}

/** Simula que el usuario se autenticó en el IdP: registra el código y arma el retorno. */
function userApproves(authorizationUrl: string, code: string): URL {
  const params = new URL(authorizationUrl).searchParams;
  codes.set(code, {
    challenge: params.get('code_challenge') ?? '',
    nonce: params.get('nonce') ?? '',
  });
  const callback = new URL(REDIRECT_URI);
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', params.get('state') ?? '');
  return callback;
}

describe('OidcIdentityProvider (Authorization Code + PKCE)', () => {
  it('builds an authorization URL with PKCE S256, state and nonce', async () => {
    const request = await provider().createAuthorizationRequest();
    const url = new URL(request.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email',
      state: request.state,
      nonce: request.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(request.codeVerifier).digest('base64url'),
    });
  });

  it('exchanges the code and returns the ID token claims', async () => {
    const idp = provider();
    const request = await idp.createAuthorizationRequest();
    const claims = await idp.completeAuthorization({
      callbackUrl: userApproves(request.url, 'code-ok'),
      expectedState: request.state,
      expectedNonce: request.nonce,
      codeVerifier: request.codeVerifier,
    });
    expect(claims).toMatchObject({
      subject: 'idp-user-123',
      email: 'docente@cftmagallanes.cl',
      emailVerified: true,
      name: 'Camila Vidal',
      givenName: 'Camila',
      familyName: 'Vidal',
    });
    expect(claims.idToken).toEqual(expect.any(String));
  });

  it('rejects a callback whose state does not match the session', async () => {
    const idp = provider();
    const request = await idp.createAuthorizationRequest();
    await expect(
      idp.completeAuthorization({
        callbackUrl: userApproves(request.url, 'code-state'),
        expectedState: 'otro-state',
        expectedNonce: request.nonce,
        codeVerifier: request.codeVerifier,
      }),
    ).rejects.toBeInstanceOf(IntegrationError);
  });

  it('rejects a wrong PKCE verifier and a wrong nonce', async () => {
    const idp = provider();
    const request = await idp.createAuthorizationRequest();
    await expect(
      idp.completeAuthorization({
        callbackUrl: userApproves(request.url, 'code-pkce'),
        expectedState: request.state,
        expectedNonce: request.nonce,
        codeVerifier: 'x'.repeat(43),
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED' });

    const second = await idp.createAuthorizationRequest();
    await expect(
      idp.completeAuthorization({
        callbackUrl: userApproves(second.url, 'code-nonce'),
        expectedState: second.state,
        expectedNonce: 'otro-nonce',
        codeVerifier: second.codeVerifier,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED' });
  });

  it('builds the IdP logout URL with the ID token hint', async () => {
    const url = new URL(
      (await provider().getLogoutUrl({
        postLogoutRedirectUri: 'https://cursos.example.cl/',
        idTokenHint: 'id-token',
      })) ?? '',
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/logout`);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://cursos.example.cl/');
    expect(url.searchParams.get('id_token_hint')).toBe('id-token');
  });

  it('reports an unreachable IdP as a retryable error', async () => {
    const idp = new OidcIdentityProvider({
      issuerUrl: 'http://127.0.0.1:9/',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
      scopes: 'openid',
      allowInsecureRequests: true,
    });
    await expect(idp.createAuthorizationRequest()).rejects.toMatchObject({
      code: 'DISCOVERY_FAILED',
      retryable: true,
    });
  });
});
