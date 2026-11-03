import { Redis } from 'ioredis';

/**
 * Conexión para caché y rate limit: falla rápido en vez de encolar comandos.
 * Es perezosa: quien la crea registra su listener de `error` y luego llama a `connect()`.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
}

/** Conexión para BullMQ: exige `maxRetriesPerRequest: null`. */
export function createQueueConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function redisReadinessCheck(redis: Redis) {
  return async () => {
    await redis.ping();
  };
}
