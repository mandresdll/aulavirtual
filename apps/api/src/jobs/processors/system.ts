import type { Job } from 'bullmq';
import type { Logger } from 'pino';

export interface HeartbeatResult {
  receivedAt: string;
}

/**
 * Procesador de la cola `system`. El latido periódico permite verificar
 * que el worker está vivo y procesando trabajos.
 */
export function createSystemProcessor(logger: Logger, now: () => Date = () => new Date()) {
  return async (job: Job): Promise<HeartbeatResult> => {
    switch (job.name) {
      case 'heartbeat': {
        const receivedAt = now().toISOString();
        logger.debug({ jobId: job.id, receivedAt }, 'Worker heartbeat');
        return { receivedAt };
      }
      default:
        throw new Error(`Unknown system job: ${job.name}`);
    }
  };
}
