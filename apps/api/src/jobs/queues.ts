import { Queue, type DefaultJobOptions } from 'bullmq';
import type { Redis } from 'ioredis';

/**
 * Colas de trabajos asíncronos. Cada fase agrega la suya
 * (p. ej. `enrollment` en la Fase 5, `certificates` en la Fase 6).
 */
export const QUEUE_NAMES = {
  system: 'system',
  checkout: 'checkout',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Reintentos con backoff exponencial: 10 s, 20 s, 40 s, 80 s, 160 s. */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 5_000 },
};

export function createQueue(name: QueueName, connection: Redis): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}
