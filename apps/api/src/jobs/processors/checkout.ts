import type { Job } from 'bullmq';
import type { Logger } from 'pino';

export interface CheckoutJobs {
  expireStaleOrders(): Promise<number>;
  recoverConfirmations(): Promise<number>;
  sendPendingReceipts(): Promise<number>;
}

/**
 * Procesador de la cola `checkout` (RF-03): anula las órdenes cuyo plazo de pago venció,
 * retoma confirmaciones interrumpidas y envía los comprobantes pendientes.
 */
export function createCheckoutProcessor(checkout: CheckoutJobs, logger: Logger) {
  return async (job: Job): Promise<Record<string, number>> => {
    switch (job.name) {
      case 'expire-orders': {
        const expired = await checkout.expireStaleOrders();
        if (expired > 0) logger.info({ expired }, 'Expired unpaid orders');
        return { expired };
      }
      case 'recover-payments': {
        const recovered = await checkout.recoverConfirmations();
        if (recovered > 0) logger.info({ recovered }, 'Recovered payment confirmations');
        return { recovered };
      }
      case 'send-receipts': {
        const sent = await checkout.sendPendingReceipts();
        if (sent > 0) logger.info({ sent }, 'Sent receipts');
        return { sent };
      }
      default:
        throw new Error(`Unknown checkout job: ${job.name}`);
    }
  };
}
