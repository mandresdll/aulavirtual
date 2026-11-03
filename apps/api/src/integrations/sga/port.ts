import type { CommunityProfile, PlatformRole } from '@plataforma/shared';

/**
 * Puerto de la API del SGA para roles y permisos (RF-10). Supuesto por defecto (Q7):
 * cliente HTTP con token de servicio; el contrato se define en una OpenAPI propia como mock.
 */
export interface SgaUserRoles {
  sgaUserId: string;
  /** Perfiles institucionales: habilitan la inscripción liberada (RF-04). */
  profiles: CommunityProfile[];
  /** Roles de la plataforma ya mapeados desde el SGA. */
  platformRoles: PlatformRole[];
}

export interface SgaGateway {
  readonly provider: string;
  /** Roles del usuario según el `subject` del IdP; `null` si el SGA no lo conoce. */
  getUserRoles(subject: string): Promise<SgaUserRoles | null>;
}
