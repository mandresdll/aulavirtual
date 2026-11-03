import {
  COMMUNITY_PROFILES,
  PLATFORM_ROLES,
  type CommunityProfile,
  type PlatformRole,
} from '@plataforma/shared';
import { z } from 'zod';
import { IntegrationError } from '../errors.js';
import type { SgaGateway, SgaUserRoles } from './port.js';

export interface SgaHttpConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  /** Inyectable para pruebas. */
  fetch?: typeof fetch;
}

/**
 * Respuesta supuesta de la API del SGA (Q7, pendiente de confirmar con la UTA):
 * `GET {SGA_API_URL}/users/{subject}/roles` con `Authorization: Bearer {SGA_API_TOKEN}`.
 * 404 significa que el SGA no conoce al usuario. Ver docs/integraciones.md.
 */
const SgaRolesResponseSchema = z.object({
  sgaUserId: z.string().min(1),
  profiles: z.array(z.string()),
  roles: z.array(z.string()),
});

const isProfile = (value: string): value is CommunityProfile =>
  (COMMUNITY_PROFILES as readonly string[]).includes(value);
const isPlatformRole = (value: string): value is PlatformRole =>
  (PLATFORM_ROLES as readonly string[]).includes(value);

/**
 * Cliente HTTP de la API del SGA sobre el contrato supuesto. Los perfiles y roles que la
 * plataforma no conoce se descartan (deny by default): un rol nuevo del SGA no da permisos
 * hasta que se mapee explícitamente.
 */
export class HttpSgaGateway implements SgaGateway {
  readonly provider = 'http';

  constructor(readonly config: SgaHttpConfig) {}

  async getUserRoles(subject: string): Promise<SgaUserRoles | null> {
    const url = new URL(
      `users/${encodeURIComponent(subject)}/roles`,
      this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`,
    );
    const doFetch = this.config.fetch ?? fetch;

    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.config.token}` },
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 5_000),
      });
    } catch (error) {
      throw new IntegrationError('sga', 'UNAVAILABLE', 'SGA API unreachable', true, {
        cause: error,
      });
    }

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new IntegrationError(
        'sga',
        `HTTP_${response.status}`,
        `SGA API responded ${response.status}`,
        response.status >= 500,
      );
    }

    const parsed = SgaRolesResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new IntegrationError('sga', 'INVALID_RESPONSE', 'Unexpected SGA API response');
    }
    return {
      sgaUserId: parsed.data.sgaUserId,
      profiles: parsed.data.profiles.filter(isProfile),
      platformRoles: parsed.data.roles.filter(isPlatformRole),
    };
  }
}
