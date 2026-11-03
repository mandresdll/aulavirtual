import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { NoCache, RedisCache } from './cache.js';

/** Redis falso con lo mínimo que usa `RedisCache`. */
function fakeRedis(options: { failing?: boolean } = {}) {
  const store = new Map<string, string>();
  const fail = () => {
    if (options.failing) throw new Error('ECONNREFUSED');
  };
  const redis = {
    store,
    mget: vi.fn(async (keys: string[]) => {
      fail();
      return keys.map((key) => store.get(key) ?? null);
    }),
    pipeline: vi.fn(() => {
      const ops: [string, string][] = [];
      return {
        set(key: string, value: string) {
          ops.push([key, value]);
          return this;
        },
        async exec() {
          fail();
          for (const [key, value] of ops) store.set(key, value);
          return [];
        },
      };
    }),
    del: vi.fn(async (...keys: string[]) => {
      fail();
      keys.forEach((key) => store.delete(key));
      return keys.length;
    }),
  };
  return redis as typeof redis & Redis;
}

describe('RedisCache', () => {
  it('loads once and then serves the JSON value from Redis', async () => {
    const redis = fakeRedis();
    const cache = new RedisCache(redis, 'p:');
    const load = vi.fn(async () => ({ at: '2026-01-01T00:00:00.000Z', n: 1 }));

    expect(await cache.getOrSet('k', 60, load)).toEqual({ at: '2026-01-01T00:00:00.000Z', n: 1 });
    expect(await cache.getOrSet('k', 60, load)).toEqual({ at: '2026-01-01T00:00:00.000Z', n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(redis.store.has('p:k')).toBe(true);
  });

  it('caches null results too', async () => {
    const cache = new RedisCache(fakeRedis());
    const load = vi.fn(async () => null);
    await cache.getOrSet('missing', 60, load);
    expect(await cache.getOrSet('missing', 60, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads only the missing keys in a batch', async () => {
    const cache = new RedisCache(fakeRedis());
    await cache.getOrSetMany(['a'], 60, async () => new Map([['a', 1]]));
    const load = vi.fn(async (missing: readonly string[]) => new Map(missing.map((k) => [k, 2])));
    const result = await cache.getOrSetMany(['a', 'b'], 60, load);
    expect(load).toHaveBeenCalledWith(['b']);
    expect(result).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
  });

  it('falls back to the source and reports the error when Redis is down', async () => {
    const onError = vi.fn();
    const cache = new RedisCache(fakeRedis({ failing: true }), 'p:', onError);
    expect(await cache.getOrSet('k', 60, async () => 'fresh')).toBe('fresh');
    await cache.delete(['k']);
    expect(onError.mock.calls.map(([, operation]) => operation)).toEqual(['mget', 'set', 'del']);
  });

  it('deletes keys with the prefix', async () => {
    const redis = fakeRedis();
    const cache = new RedisCache(redis, 'p:');
    await cache.getOrSet('k', 60, async () => 1);
    await cache.delete(['k']);
    expect(redis.store.size).toBe(0);
  });
});

describe('NoCache', () => {
  it('always reads from the source', async () => {
    const cache = new NoCache();
    const load = vi.fn(async () => 1);
    await cache.getOrSet('k', 60, load);
    await cache.getOrSet('k', 60, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await cache.getOrSetMany([], 60, load as never)).toEqual(new Map());
  });
});
