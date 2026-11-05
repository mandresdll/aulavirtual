import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createCheckoutProcessor } from './checkout.js';

const jobs = () => ({
  expireStaleOrders: vi.fn().mockResolvedValue(3),
  recoverConfirmations: vi.fn().mockResolvedValue(1),
  sendPendingReceipts: vi.fn().mockResolvedValue(2),
});

describe('checkout processor', () => {
  it('runs each scheduled job', async () => {
    const process = createCheckoutProcessor(jobs(), pino({ enabled: false }));
    await expect(process({ name: 'expire-orders' } as Job)).resolves.toEqual({ expired: 3 });
    await expect(process({ name: 'recover-payments' } as Job)).resolves.toEqual({ recovered: 1 });
    await expect(process({ name: 'send-receipts' } as Job)).resolves.toEqual({ sent: 2 });
  });

  it('rejects unknown jobs', async () => {
    const process = createCheckoutProcessor(jobs(), pino({ enabled: false }));
    await expect(process({ name: 'otro' } as Job)).rejects.toThrow('Unknown checkout job');
  });
});
