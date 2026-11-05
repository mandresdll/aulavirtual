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

  it('lets finance manage coupons but not the catalog or legal texts', () => {
    expect(hasPermission(['uta_finance'], 'coupons:manage')).toBe(true);
    expect(hasPermission(['uta_editor'], 'coupons:manage')).toBe(false);
    expect(hasPermission(['uta_finance'], 'legal:manage')).toBe(false);
    expect(hasPermission(['uta_admin'], 'legal:manage')).toBe(true);
    expect(canAccessAdmin(['uta_finance'])).toBe(true);
  });

  it('gives the reports role only the reports, and finance the sales', () => {
    expect(hasPermission(['uta_reports'], 'reports:read')).toBe(true);
    expect(hasPermission(['uta_reports'], 'sales:manage')).toBe(false);
    expect(hasPermission(['uta_finance'], 'sales:manage')).toBe(true);
    expect(hasPermission(['uta_finance'], 'diffusion:manage')).toBe(false);
    expect(hasPermission(['uta_editor'], 'diffusion:manage')).toBe(true);
    expect(canAccessAdmin(['uta_reports'])).toBe(true);
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
