import { cacheAside, CachePort } from './cache-aside';

class FakeCache implements CachePort {
  store = new Map<string, unknown>();
  getCalls = 0;
  setCalls = 0;
  async get<T>(key: string): Promise<T | null> {
    this.getCalls++;
    return this.store.has(key) ? (this.store.get(key) as T) : null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.setCalls++;
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('Cache-Aside', () => {
  it('cache MISS loads from the source and caches it (hit=false)', async () => {
    const cache = new FakeCache();
    let loaderCalls = 0;
    const res = await cacheAside(cache, 'k1', 60, async () => {
      loaderCalls++;
      return { v: 42 };
    });
    expect(res.hit).toBe(false);
    expect(res.value).toEqual({ v: 42 });
    expect(loaderCalls).toBe(1);
    expect(cache.setCalls).toBe(1);
  });

  it('cache HIT returns the cached value without invoking the loader (hit=true)', async () => {
    const cache = new FakeCache();
    cache.store.set('k1', { v: 7 });
    let loaderCalls = 0;
    const res = await cacheAside(cache, 'k1', 60, async () => {
      loaderCalls++;
      return { v: 999 };
    });
    expect(res.hit).toBe(true);
    expect(res.value).toEqual({ v: 7 });
    expect(loaderCalls).toBe(0);
  });

  it('does not cache null values (no cache poisoning)', async () => {
    const cache = new FakeCache();
    const res = await cacheAside<null>(cache, 'k1', 60, async () => null);
    expect(res.hit).toBe(false);
    expect(cache.setCalls).toBe(0);
  });
});
