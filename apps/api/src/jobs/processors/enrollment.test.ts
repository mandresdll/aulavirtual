import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationError } from '../../integrations/errors.js';
import { EnrollmentConfigError } from '../../modules/enrollment/enrollment.service.js';
import { createEnrollmentProcessor, type EnrollmentQueue } from './enrollment.js';

const logger = pino({ enabled: false });

const jobs = () => ({
  pendingIds: vi.fn().mockResolvedValue(['a', 'b']),
  process: vi.fn().mockResolvedValue(undefined),
  recordAttempt: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  sendWelcomes: vi.fn().mockResolvedValue(2),
  syncWithdrawals: vi.fn().mockResolvedValue(1),
  advanceWaitlists: vi.fn().mockResolvedValue(1),
  sendWaitlistOffers: vi.fn().mockResolvedValue(1),
});

function queue(states: Record<string, string> = {}) {
  const remove = vi.fn().mockResolvedValue(undefined);
  const add = vi.fn().mockResolvedValue(undefined);
  const value: EnrollmentQueue = {
    getJob: async (id) =>
      states[id] ? ({ getState: async () => states[id], remove } as never) : undefined,
    add,
  };
  return { value, add, remove };
}

const enrollJob = (attemptsMade: number) =>
  ({
    name: 'enroll-user',
    data: { enrollmentId: 'a' },
    attemptsMade,
    opts: { attempts: 5 },
  }) as unknown as Job;

describe('enrollment sweep', () => {
  it('queues pending enrollments once, and again after a finished job', async () => {
    const q = queue({ 'enroll-a': 'delayed', 'enroll-b': 'failed' });
    const process = createEnrollmentProcessor(jobs(), q.value, logger);
    await expect(process({ name: 'sweep-enrollments' } as Job)).resolves.toEqual({ queued: 1 });
    expect(q.remove).toHaveBeenCalledTimes(1);
    expect(q.add).toHaveBeenCalledWith('enroll-user', { enrollmentId: 'b' }, { jobId: 'enroll-b' });
  });
});

describe('enroll-user job', () => {
  it('enrolls', async () => {
    const j = jobs();
    await createEnrollmentProcessor(j, queue().value, logger)(enrollJob(0));
    expect(j.process).toHaveBeenCalledWith('a');
    expect(j.markFailed).not.toHaveBeenCalled();
  });

  it('records the attempt and rethrows a temporary error so BullMQ retries', async () => {
    const j = jobs();
    const down = new IntegrationError('lms', 'UNAVAILABLE', 'down', true);
    j.process.mockRejectedValue(down);
    await expect(createEnrollmentProcessor(j, queue().value, logger)(enrollJob(1))).rejects.toBe(
      down,
    );
    expect(j.recordAttempt).toHaveBeenCalledWith('a', 'down');
    expect(j.markFailed).not.toHaveBeenCalled();
  });

  it('fails the enrollment when the retries run out', async () => {
    const j = jobs();
    j.process.mockRejectedValue(new IntegrationError('lms', 'UNAVAILABLE', 'down', true));
    await createEnrollmentProcessor(j, queue().value, logger)(enrollJob(4));
    expect(j.markFailed).toHaveBeenCalledWith('a', 'down');
  });

  it('fails at once on errors that retrying cannot fix', async () => {
    for (const error of [
      new EnrollmentConfigError('Sin curso'),
      new IntegrationError('lms', 'invalidparameter', 'Moodle: datos inválidos'),
    ]) {
      const j = jobs();
      j.process.mockRejectedValue(error);
      await createEnrollmentProcessor(j, queue().value, logger)(enrollJob(0));
      expect(j.markFailed).toHaveBeenCalledTimes(1);
      expect(j.recordAttempt).not.toHaveBeenCalled();
    }
  });
});

describe('scheduled jobs', () => {
  it('runs welcomes, withdrawals and waitlists', async () => {
    const process = createEnrollmentProcessor(jobs(), queue().value, logger);
    await expect(process({ name: 'send-welcomes' } as Job)).resolves.toEqual({ sent: 2 });
    await expect(process({ name: 'sync-withdrawals' } as Job)).resolves.toEqual({ synced: 1 });
    await expect(process({ name: 'advance-waitlists' } as Job)).resolves.toEqual({
      offered: 1,
      sent: 1,
    });
    await expect(process({ name: 'otro' } as Job)).rejects.toThrow('Unknown enrollment job');
  });
});
