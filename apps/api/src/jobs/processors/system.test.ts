import type { Job } from 'bullmq';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createSystemProcessor } from './system.js';

const logger = pino({ level: 'silent' });

describe('system processor', () => {
  it('answers heartbeat jobs with the processing time', async () => {
    const processor = createSystemProcessor(logger, () => new Date('2026-11-03T12:00:00Z'));
    const result = await processor({ id: '1', name: 'heartbeat' } as Job);
    expect(result).toEqual({ receivedAt: '2026-11-03T12:00:00.000Z' });
  });

  it('fails on unknown jobs so BullMQ records the error', async () => {
    const processor = createSystemProcessor(logger);
    await expect(processor({ id: '2', name: 'nope' } as Job)).rejects.toThrow(/Unknown/);
  });
});
