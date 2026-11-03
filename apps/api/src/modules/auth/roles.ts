import type { CommunityProfile, PlatformRole } from '@plataforma/shared';
import type { Cache } from '../../infra/cache.js';
import type { SgaGateway } from '../../integrations/sga/port.js';
import { AppError } from '../../lib/errors.js';

export interface ResolvedRoles {
  sgaUserId: string | null;
  roles: PlatformRole[];
  profiles: CommunityProfile[];
}

const NO_ROLES: ResolvedRoles = { sgaUserId: null, roles: [], profiles: [] };
const keyOf = (subject: string) => `sga:roles:v1:${subject}`;

/**
 * Roles y perfiles del usuario según el SGA (`SgaGateway.getUserRoles`), con caché corta en
 * Redis (`SGA_ROLES_CACHE_TTL_SECONDS`). Un usuario que el SGA no conoce no tiene roles.
 * Si el SGA no responde, se niega el acceso (nunca se asumen permisos).
 */
export class RoleResolver {
  constructor(
    private readonly sga: SgaGateway,
    private readonly cache: Cache,
    private readonly ttlSeconds: number,
  ) {}

  resolve(subject: string): Promise<ResolvedRoles> {
    return this.cache.getOrSet(keyOf(subject), this.ttlSeconds, () => this.fetch(subject));
  }

  /** Ignora la caché: al iniciar sesión siempre se leen los roles vigentes. */
  async refresh(subject: string): Promise<ResolvedRoles> {
    await this.cache.delete([keyOf(subject)]);
    return this.resolve(subject);
  }

  private async fetch(subject: string): Promise<ResolvedRoles> {
    let result: Awaited<ReturnType<SgaGateway['getUserRoles']>>;
    try {
      result = await this.sga.getUserRoles(subject);
    } catch (error) {
      throw new AppError(
        503,
        'SGA_UNAVAILABLE',
        'No pudimos verificar tus permisos en el SGA. Intenta nuevamente en unos minutos.',
        undefined,
        { cause: error },
      );
    }
    if (!result) return NO_ROLES;
    return {
      sgaUserId: result.sgaUserId,
      roles: [...result.platformRoles],
      profiles: [...result.profiles],
    };
  }
}
