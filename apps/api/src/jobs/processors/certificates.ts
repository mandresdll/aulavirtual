import type { Job } from 'bullmq';
import type { Logger } from 'pino';

export interface CertificateJobs {
  syncResults(): Promise<{ checked: number; completed: number; failed: number }>;
  sendCertificates(): Promise<number>;
  syncValidator(): Promise<number>;
}

/** Procesador de la cola `certificates` (RF-06). */
export function createCertificatesProcessor(jobs: CertificateJobs, logger: Logger) {
  return async (job: Job): Promise<Record<string, number>> => {
    switch (job.name) {
      case 'sync-results': {
        const summary = await jobs.syncResults();
        logger.info(summary, 'Course results synced');
        return summary;
      }
      case 'send-certificates':
        return { sent: await jobs.sendCertificates() };
      case 'sync-validator':
        return { synced: await jobs.syncValidator() };
      default:
        throw new Error(`Unknown certificates job: ${job.name}`);
    }
  };
}
