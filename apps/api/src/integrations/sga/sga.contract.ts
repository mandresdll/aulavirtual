import { describe, expect, it } from 'vitest';
import type { SgaGateway } from './port.js';

export interface SgaHarness {
  sga: SgaGateway;
  /** `subject` de un usuario que el SGA conoce y que tiene el rol `uta_admin`. */
  adminSubject: string;
}

/** Contrato de comportamiento de `SgaGateway`: se ejecuta contra el mock y el adaptador HTTP. */
export function sgaContract(name: string, setup: () => SgaHarness) {
  describe(`SgaGateway contract: ${name}`, () => {
    it('returns the platform roles and profiles of a known user', async () => {
      const { sga, adminSubject } = setup();
      const roles = await sga.getUserRoles(adminSubject);
      expect(roles?.sgaUserId).toEqual(expect.any(String));
      expect(roles?.platformRoles).toContain('uta_admin');
      expect(Array.isArray(roles?.profiles)).toBe(true);
    });

    it('returns null for an unknown user', async () => {
      const { sga } = setup();
      expect(await sga.getUserRoles('usuario-inexistente')).toBeNull();
    });
  });
}
