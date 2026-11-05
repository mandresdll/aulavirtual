import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createDiffusionProcessor, createSalesProcessor } from './sales.js';

const logger = pino({ enabled: false });
const job = (name: string) => ({ name }) as Job;

describe('sales processor', () => {
  const jobs = () => ({
    reconcilePayments: vi.fn().mockResolvedValue({
      day: '2026-06-01',
      checked: 5,
      discrepancies: 1,
      failed: 0,
    }),
    submitDocuments: vi.fn().mockResolvedValue(3),
  });

  it('runs each job by name', async () => {
    const process = createSalesProcessor(jobs(), logger);
    expect(await process(job('reconcile-payments'))).toEqual({
      checked: 5,
      discrepancies: 1,
      failed: 0,
    });
    expect(await process(job('submit-documents'))).toEqual({ processed: 3 });
  });

  it('rejects unknown jobs', async () => {
    await expect(createSalesProcessor(jobs(), logger)(job('x'))).rejects.toThrow(/Unknown/);
  });
});

describe('diffusion processor', () => {
  it('sends pending campaigns and rejects unknown jobs', async () => {
    const process = createDiffusionProcessor({ sendCampaigns: vi.fn().mockResolvedValue(7) });
    expect(await process(job('send-campaigns'))).toEqual({ sent: 7 });
    await expect(process(job('x'))).rejects.toThrow(/Unknown/);
  });
});
