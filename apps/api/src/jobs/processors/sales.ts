import type { Job } from 'bullmq';
import type { Logger } from 'pino';

export interface SalesJobs {
  reconcilePayments(): Promise<{ checked: number; discrepancies: number; failed: number }>;
  submitDocuments(): Promise<number>;
}

/** Procesador de la cola `sales` (RF-08). */
export function createSalesProcessor(jobs: SalesJobs, logger: Logger) {
  return async (job: Job): Promise<Record<string, number>> => {
    switch (job.name) {
      case 'reconcile-payments': {
        const { checked, discrepancies, failed } = await jobs.reconcilePayments();
        const summary = { checked, discrepancies, failed };
        logger.info(summary, 'Payments reconciled');
        return summary;
      }
      case 'submit-documents':
        return { processed: await jobs.submitDocuments() };
      default:
        throw new Error(`Unknown sales job: ${job.name}`);
    }
  };
}

export interface DiffusionJobs {
  sendCampaigns(): Promise<number>;
  purgeLeads(): Promise<number>;
}

/** Procesador de la cola `diffusion` (RF-02). */
export function createDiffusionProcessor(jobs: DiffusionJobs) {
  return async (job: Job): Promise<Record<string, number>> => {
    switch (job.name) {
      case 'send-campaigns':
        return { sent: await jobs.sendCampaigns() };
      case 'purge-leads':
        return { purged: await jobs.purgeLeads() };
      default:
        throw new Error(`Unknown diffusion job: ${job.name}`);
    }
  };
}
