import type { CommunityProfile, PlatformRole } from '@plataforma/shared';

/**
 * Identidades de demostración compartidas por los mocks del proveedor de identidad y del SGA.
 * Solo para desarrollo y pruebas: los adaptadores simulados están bloqueados en producción.
 */
export interface MockIdentity {
  subject: string;
  sgaUserId: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  profiles: CommunityProfile[];
  platformRoles: PlatformRole[];
}

export const MOCK_IDENTITIES: readonly MockIdentity[] = [
  {
    subject: 'mock-admin',
    sgaUserId: 'sga-0001',
    email: 'admin.uta@example.com',
    name: 'Administración UTA',
    givenName: 'Administración',
    familyName: 'UTA',
    profiles: ['staff'],
    platformRoles: ['uta_admin', 'community_member'],
  },
  {
    subject: 'mock-editor',
    sgaUserId: 'sga-0002',
    email: 'editor.uta@example.com',
    name: 'Editora UTA',
    givenName: 'Editora',
    familyName: 'UTA',
    profiles: ['staff'],
    platformRoles: ['uta_editor', 'community_member'],
  },
  {
    subject: 'mock-finance',
    sgaUserId: 'sga-0003',
    email: 'finanzas.uta@example.com',
    name: 'Finanzas UTA',
    givenName: 'Finanzas',
    familyName: 'UTA',
    profiles: ['staff'],
    platformRoles: ['uta_finance', 'uta_reports', 'community_member'],
  },
  {
    subject: 'mock-student',
    sgaUserId: 'sga-1001',
    email: 'estudiante@example.com',
    name: 'Estudiante de Prueba',
    givenName: 'Estudiante',
    familyName: 'de Prueba',
    profiles: ['student'],
    platformRoles: ['community_member'],
  },
  {
    subject: 'mock-teacher',
    sgaUserId: 'sga-2001',
    email: 'docente@example.com',
    name: 'Docente de Prueba',
    givenName: 'Docente',
    familyName: 'de Prueba',
    profiles: ['teacher'],
    platformRoles: ['community_member'],
  },
];
