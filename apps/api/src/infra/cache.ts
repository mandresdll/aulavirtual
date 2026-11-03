import type { Redis } from 'ioredis';

/**
 * Caché de lectura con expiración. Los valores se guardan como JSON, así que deben ser
 * serializables (fechas como texto ISO). Si Redis falla, se lee de la fuente: la caché
 * acelera, pero nunca es requisito para responder.
 */
export interface Cache {
  getOrSet<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
  /** Lee varias claves y carga solo las que faltan, en una sola llamada a `load`. */
  getOrSetMany<T>(
    keys: readonly string[],
    ttlSeconds: number,
    load: (missing: readonly string[]) => Promise<Map<string, T>>,
  ): Promise<Map<string, T>>;
  delete(keys: readonly string[]): Promise<void>;
  /** Borra todas las claves que empiezan con `prefix` (p. ej. páginas del listado). */
  deleteByPrefix(prefix: string): Promise<void>;
}

export interface CacheErrorReporter {
  (error: unknown, operation: string): void;
}

export class RedisCache implements Cache {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'cache:',
    private readonly onError: CacheErrorReporter = () => {},
  ) {}

  async getOrSet<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const result = await this.getOrSetMany([key], ttlSeconds, async () => {
      return new Map([[key, await load()]]);
    });
    return result.get(key) as T;
  }

  async getOrSetMany<T>(
    keys: readonly string[],
    ttlSeconds: number,
    load: (missing: readonly string[]) => Promise<Map<string, T>>,
  ): Promise<Map<string, T>> {
    const found = new Map<string, T>();
    if (keys.length === 0) return found;

    let cached: (string | null)[] = [];
    try {
      cached = await this.redis.mget(keys.map((key) => this.prefix + key));
    } catch (error) {
      this.onError(error, 'mget');
    }
    keys.forEach((key, index) => {
      const raw = cached[index];
      if (raw != null) found.set(key, JSON.parse(raw) as T);
    });

    const missing = keys.filter((key) => !found.has(key));
    if (missing.length === 0) return found;

    const loaded = await load(missing);
    try {
      const pipeline = this.redis.pipeline();
      for (const [key, value] of loaded) {
        pipeline.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
      }
      await pipeline.exec();
    } catch (error) {
      this.onError(error, 'set');
    }
    for (const [key, value] of loaded) found.set(key, value);
    return found;
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys.map((key) => this.prefix + key));
    } catch (error) {
      this.onError(error, 'del');
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          // Los comodines de MATCH se escapan: el prefijo se trata como texto literal.
          `${this.prefix}${prefix.replace(/[*?[\]\\]/g, '\\$&')}*`,
          'COUNT',
          500,
        );
        if (keys.length > 0) await this.redis.unlink(...keys);
        cursor = next;
      } while (cursor !== '0');
    } catch (error) {
      this.onError(error, 'del');
    }
  }
}

/** Sin caché: siempre lee de la fuente (pruebas unitarias y entornos sin Redis). */
export class NoCache implements Cache {
  async getOrSet<T>(_key: string, _ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    return load();
  }

  async getOrSetMany<T>(
    keys: readonly string[],
    _ttlSeconds: number,
    load: (missing: readonly string[]) => Promise<Map<string, T>>,
  ): Promise<Map<string, T>> {
    return keys.length === 0 ? new Map() : load(keys);
  }

  async delete(): Promise<void> {}

  async deleteByPrefix(): Promise<void> {}
}
