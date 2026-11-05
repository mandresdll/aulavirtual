import type { Job } from 'bullmq';
import type { Logger } from 'pino';

export interface CheckoutJobs {
  expireStaleOrders(): Promise<number>;
}

/**
 * Procesador de la cola `checkout`: cada minuto anula las órdenes cuyo plazo de pago venció y
 * libera sus cupos y usos de cupón (RF-03).
 */
export function createCheckoutProcessor(checkout: CheckoutJobs, logger: Logger) {
  return async (job: Job): Promise<{ expired: number }> => {
    switch (job.name) {
      case 'expire-orders': {
        const expired = await checkout.expireStaleOrders();
        if (expired > 0) logger.info({ expired }, 'Expired unpaid orders');
        return { expired };
      }
      default:
        throw new Error(`Unknown checkout job: ${job.name}`);
    }
  };
}
