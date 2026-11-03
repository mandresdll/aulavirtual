import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createCheckoutProcessor } from './checkout.js';

describe('checkout processor', () => {
  it('expires stale orders', async () => {
    const expireStaleOrders = vi.fn().mockResolvedValue(3);
    const process = createCheckoutProcessor({ expireStaleOrders }, pino({ enabled: false }));
    await expect(process({ name: 'expire-orders' } as Job)).resolves.toEqual({ expired: 3 });
  });

  it('rejects unknown jobs', async () => {
    const process = createCheckoutProcessor(
      { expireStaleOrders: vi.fn() },
      pino({ enabled: false }),
    );
    await expect(process({ name: 'otro' } as Job)).rejects.toThrow('Unknown checkout job');
  });
});
