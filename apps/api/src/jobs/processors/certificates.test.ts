import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createCertificatesProcessor } from './certificates.js';

const logger = pino({ enabled: false });

const jobs = () => ({
  syncResults: vi.fn().mockResolvedValue({ checked: 3, completed: 2, failed: 1 }),
  sendCertificates: vi.fn().mockResolvedValue(2),
  syncValidator: vi.fn().mockResolvedValue(4),
});

const job = (name: string) => ({ name }) as Job;

describe('certificates processor', () => {
  it('runs each sweep by name', async () => {
    const process = createCertificatesProcessor(jobs(), logger);
    expect(await process(job('sync-results'))).toEqual({ checked: 3, completed: 2, failed: 1 });
    expect(await process(job('send-certificates'))).toEqual({ sent: 2 });
    expect(await process(job('sync-validator'))).toEqual({ synced: 4 });
  });

  it('rejects unknown jobs', async () => {
    await expect(createCertificatesProcessor(jobs(), logger)(job('x'))).rejects.toThrow(/Unknown/);
  });
});
