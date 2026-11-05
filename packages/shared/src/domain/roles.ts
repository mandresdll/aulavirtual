import { z } from 'zod';

/** Roles de la plataforma, mapeados desde los roles del SGA (RF-10). */
export const PLATFORM_ROLES = [
  'uta_admin',
  'uta_editor',
  'uta_finance',
  'uta_reports',
  'buyer',
  'community_member',
] as const;

export const PlatformRoleSchema = z.enum(PLATFORM_ROLES);
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;

/** Perfiles institucionales del SGA que dan acceso a inscripción liberada (RF-04). */
export const COMMUNITY_PROFILES = ['student', 'teacher', 'staff'] as const;

export const CommunityProfileSchema = z.enum(COMMUNITY_PROFILES);
export type CommunityProfile = z.infer<typeof CommunityProfileSchema>;

/**
 * Permisos de la plataforma y roles que los otorgan (deny by default: un rol que no aparece
 * no tiene el permiso). La API los exige en cada ruta y la SPA los usa para mostrar el menú.
 */
export const PERMISSIONS = {
  /** Panel de administración: cursos, ediciones, áreas y docentes (RF-07). */
  'catalog:manage': ['uta_admin', 'uta_editor'],
  /** Leer cursos y ediciones del panel (p. ej. para definir el alcance de un cupón). */
  'catalog:read': ['uta_admin', 'uta_editor', 'uta_finance'],
  /** Cupones de descuento, becas y convenios (RF-04). */
  'coupons:manage': ['uta_admin', 'uta_finance'],
  /** Textos legales versionados (RF-11). */
  'legal:manage': ['uta_admin'],
  /** Vista de auditoría de solo lectura (RF-12). */
  'audit:read': ['uta_admin'],
} as const satisfies Record<string, readonly PlatformRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(roles: readonly PlatformRole[], permission: Permission): boolean {
  const allowed: readonly PlatformRole[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}

/** Roles que pueden entrar al panel `/admin` (alguno de sus permisos). */
export function canAccessAdmin(roles: readonly PlatformRole[]): boolean {
  return (Object.keys(PERMISSIONS) as Permission[]).some((permission) =>
    hasPermission(roles, permission),
  );
}

/** Rol más alto del usuario, para registrar en auditoría (`actorRole`). */
export function primaryRole(roles: readonly PlatformRole[]): PlatformRole | null {
  return PLATFORM_ROLES.find((role) => roles.includes(role)) ?? null;
}

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  uta_admin: 'Administración UTA',
  uta_editor: 'Edición de contenidos',
  uta_finance: 'Finanzas',
  uta_reports: 'Reportes',
  buyer: 'Comprador',
  community_member: 'Comunidad CFT',
};
