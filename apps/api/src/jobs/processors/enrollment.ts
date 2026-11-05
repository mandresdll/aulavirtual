import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import { IntegrationError } from '../../integrations/errors.js';
import { EnrollmentConfigError } from '../../modules/enrollment/enrollment.service.js';

export interface EnrollmentJobs {
  pendingIds(): Promise<string[]>;
  process(enrollmentId: string): Promise<void>;
  recordAttempt(enrollmentId: string, message: string): Promise<void>;
  markFailed(enrollmentId: string, message: string): Promise<void>;
  sendWelcomes(): Promise<number>;
  syncWithdrawals(): Promise<number>;
  advanceWaitlists(): Promise<number>;
  sendWaitlistOffers(): Promise<number>;
}

/** Lo que se usa de la cola: encolar y consultar un trabajo existente. */
export interface EnrollmentQueue {
  getJob(id: string): Promise<Pick<Job, 'getState' | 'remove'> | undefined>;
  add(name: string, data: { enrollmentId: string }, options: { jobId: string }): Promise<unknown>;
}

const jobIdOf = (enrollmentId: string) => `enroll-${enrollmentId}`;

/** Un error de datos o de configuración no se arregla reintentando. */
function isDefinitive(error: unknown): boolean {
  return (
    error instanceof EnrollmentConfigError ||
    (error instanceof IntegrationError && !error.retryable)
  );
}

/**
 * Procesador de la cola `enrollment` (RF-05). El barrido encola `enroll-user` por cada inscripción
 * pendiente; BullMQ aplica los reintentos exponenciales. Al agotarse, o ante un error
 * definitivo, la inscripción queda `failed`.
 */
export function createEnrollmentProcessor(
  jobs: EnrollmentJobs,
  queue: EnrollmentQueue,
  logger: Logger,
) {
  return async (job: Job): Promise<Record<string, number>> => {
    switch (job.name) {
      case 'sweep-enrollments': {
        let queued = 0;
        for (const enrollmentId of await jobs.pendingIds()) {
          const jobId = jobIdOf(enrollmentId);
          const existing = await queue.getJob(jobId);
          if (existing) {
            // Un trabajo terminado no deja reencolar el mismo id (reintento desde el panel).
            const state = await existing.getState();
            if (state !== 'completed' && state !== 'failed') continue;
            await existing.remove();
          }
          await queue.add('enroll-user', { enrollmentId }, { jobId });
          queued += 1;
        }
        return { queued };
      }
      case 'enroll-user': {
        const { enrollmentId } = job.data as { enrollmentId: string };
        try {
          await jobs.process(enrollmentId);
          return { enrolled: 1 };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Error desconocido';
          const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
          if (isDefinitive(error) || exhausted) {
            logger.error({ err: error, enrollmentId }, 'Enrollment failed');
            await jobs.markFailed(enrollmentId, message);
            return { enrolled: 0 };
          }
          await jobs.recordAttempt(enrollmentId, message);
          throw error;
        }
      }
      case 'send-welcomes':
        return { sent: await jobs.sendWelcomes() };
      case 'sync-withdrawals':
        return { synced: await jobs.syncWithdrawals() };
      case 'advance-waitlists':
        return { offered: await jobs.advanceWaitlists(), sent: await jobs.sendWaitlistOffers() };
      default:
        throw new Error(`Unknown enrollment job: ${job.name}`);
    }
  };
}
