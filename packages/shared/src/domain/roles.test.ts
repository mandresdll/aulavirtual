import { describe, expect, it } from 'vitest';
import { canAccessAdmin, hasPermission, primaryRole } from './roles.js';

describe('platform permissions (deny by default)', () => {
  it('lets admins and editors manage the catalog', () => {
    expect(hasPermission(['uta_admin'], 'catalog:manage')).toBe(true);
    expect(hasPermission(['uta_editor'], 'catalog:manage')).toBe(true);
    expect(hasPermission(['uta_finance', 'uta_reports'], 'catalog:manage')).toBe(false);
  });

  it('reserves the audit log for admins', () => {
    expect(hasPermission(['uta_admin'], 'audit:read')).toBe(true);
    expect(hasPermission(['uta_editor'], 'audit:read')).toBe(false);
  });

  it('denies everything without roles', () => {
    expect(hasPermission([], 'catalog:manage')).toBe(false);
    expect(canAccessAdmin([])).toBe(false);
    expect(canAccessAdmin(['community_member', 'buyer'])).toBe(false);
    expect(canAccessAdmin(['uta_editor'])).toBe(true);
  });

  it('picks the highest role for the audit trail', () => {
    expect(primaryRole(['community_member', 'uta_editor'])).toBe('uta_editor');
    expect(primaryRole([])).toBeNull();
  });
});
