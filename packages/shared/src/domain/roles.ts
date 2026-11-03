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
