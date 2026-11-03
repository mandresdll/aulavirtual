import { describe, expect, it } from 'vitest';
import { IntegrationError } from '../errors.js';
import type { LmsGateway } from './port.js';

export interface LmsHarness {
  lms: LmsGateway;
  /** Curso existente en el LMS donde se puede matricular. */
  courseId: number;
}

export function lmsContract(name: string, setup: () => LmsHarness) {
  describe(`LmsGateway contract: ${name}`, () => {
    const newUser = () => {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
      return {
        username: `contract.${suffix}`,
        email: `contract.${suffix}@example.com`,
        firstName: 'Prueba',
        lastName: 'Contrato',
      };
    };

    it('creates a user and finds it by email', async () => {
      const { lms } = setup();
      const input = newUser();
      const created = await lms.createUser(input);
      expect(created.id).toBeGreaterThan(0);
      expect(await lms.findUserByEmail(input.email)).toMatchObject({ id: created.id });
    });

    it('returns null for an unknown email', async () => {
      const { lms } = setup();
      expect(await lms.findUserByEmail('nadie.inexistente@example.com')).toBeNull();
    });

    it('rejects a duplicate user', async () => {
      const { lms } = setup();
      const input = newUser();
      await lms.createUser(input);
      await expect(lms.createUser(input)).rejects.toBeInstanceOf(IntegrationError);
    });

    it('enrols idempotently and unenrols', async () => {
      const { lms, courseId } = setup();
      const user = await lms.createUser(newUser());
      await lms.enrolUser({ userId: user.id, courseId });
      await lms.enrolUser({ userId: user.id, courseId });
      expect(await lms.isEnrolled({ userId: user.id, courseId })).toBe(true);
      await lms.unenrolUser({ userId: user.id, courseId });
      expect(await lms.isEnrolled({ userId: user.id, courseId })).toBe(false);
    });

    it('reports a new enrolment as not completed', async () => {
      const { lms, courseId } = setup();
      const user = await lms.createUser(newUser());
      await lms.enrolUser({ userId: user.id, courseId });
      expect(await lms.getCourseCompletion({ userId: user.id, courseId })).toMatchObject({
        completed: false,
      });
    });
  });
}
