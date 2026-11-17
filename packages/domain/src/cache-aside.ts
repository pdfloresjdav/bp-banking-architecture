/** Minimal cache port (cache-aside). */
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface CacheAsideResult<T> {
  value: T;
  hit: boolean;
}

/**
 * Cache-Aside pattern (seq-07): try the cache; on a miss, load from the source and cache with a TTL.
 * Also returns whether it was a hit for observability/tests.
 */
export async function cacheAside<T>(
  cache: CachePort,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<CacheAsideResult<T>> {
  const cached = await cache.get<T>(key);
  if (cached !== null && cached !== undefined) {
    return { value: cached, hit: true };
  }
  const value = await loader();
  // Only cache defined values; never cache null (avoids cache poisoning).
  if (value !== null && value !== undefined) {
    await cache.set(key, value, ttlSeconds);
  }
  return { value, hit: false };
}
