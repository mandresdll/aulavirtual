import type { Redis } from 'ioredis';

/**
 * Almacén de sesiones del servidor (RF-10). El navegador solo guarda un identificador
 * aleatorio; los datos viven aquí con expiración. Valores JSON.
 */
export interface SessionStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Renueva la expiración (cierre por inactividad deslizante). */
  touch(key: string, ttlSeconds: number): Promise<void>;
  /** Lee y borra en una sola operación: valores de un solo uso (transacción de login). */
  take<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'session:',
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.prefix + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(this.prefix + key, ttlSeconds);
  }

  async take<T>(key: string): Promise<T | null> {
    const raw = await this.redis.getdel(this.prefix + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

/** Sesiones en memoria del proceso: solo pruebas unitarias (no se comparte entre instancias). */
export class MemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, { raw: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return JSON.parse(entry.raw) as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      raw: JSON.stringify(value),
      expiresAt: this.now() + ttlSeconds * 1000,
    });
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > this.now()) entry.expiresAt = this.now() + ttlSeconds * 1000;
  }

  async take<T>(key: string): Promise<T | null> {
    const value = await this.get<T>(key);
    this.entries.delete(key);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
