/**
 * In-flight GET deduplication + short TTL cache + stale-while-revalidate.
 *
 * SWR behaviour:
 *  - If fresh data exists (< ttlMs old) → return it immediately, no network.
 *  - If stale data exists (< staleTtlMs old) → return stale data INSTANTLY, kick off
 *    a background refresh to update the cache for the next read.
 *  - If data is too old or missing → await fresh network fetch.
 */

type CacheEntry = { fetchedAt: number; data: unknown };

const inflight = new Map<string, Promise<unknown>>();
const shortCache = new Map<string, CacheEntry>();

export const DEFAULT_TTL_MS = 15_000;   // 15 s: serve from cache, no network
export const STALE_TTL_MS  = 120_000;  // 2 min: serve stale + refresh in bg

export function getCachedEntry(key: string): CacheEntry | null {
  return shortCache.get(key) ?? null;
}

export function getCached<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const hit = shortCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > ttlMs) return null; // expired
  return hit.data as T;
}

export function setCached(key: string, data: unknown) {
  shortCache.set(key, { data, fetchedAt: Date.now() });
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    shortCache.clear();
    inflight.clear();
    return;
  }
  for (const key of shortCache.keys()) {
    if (key.startsWith(prefix)) shortCache.delete(key);
  }
}

/**
 * dedupedGet — deduplicates in-flight requests + caches results.
 * Standard mode: await network if cache is expired.
 */
export async function dedupedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const cached = getCached<T>(key, ttlMs);
  if (cached !== null) return cached;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * swrGet — stale-while-revalidate.
 *
 * Returns a tuple: [data | null, isStale: boolean]
 *  • data !== null   → use it immediately (may be fresh or stale)
 *  • isStale === true → a background refresh has been queued automatically
 *  • data === null   → must await the network (first load)
 *
 * The revalidateCb is called when the background refresh resolves, giving the
 * caller a chance to update React state with fresh data.
 */
export async function swrGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  revalidateCb: (fresh: T) => void,
  ttlMs = DEFAULT_TTL_MS,
  staleTtlMs = STALE_TTL_MS
): Promise<T> {
  const entry = shortCache.get(key);
  const now = Date.now();

  // FRESH → instant return, no network
  if (entry && now - entry.fetchedAt < ttlMs) {
    return entry.data as T;
  }

  // STALE → return immediately, kick background refresh
  if (entry && now - entry.fetchedAt < staleTtlMs) {
    // Fire-and-forget background refresh (only one at a time)
    if (!inflight.has(key)) {
      const bg = fetcher()
        .then((fresh) => {
          setCached(key, fresh);
          revalidateCb(fresh);
          return fresh;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, bg);
    }
    return entry.data as T; // stale-but-instant
  }

  // MISS → must await network (deduplicated)
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      setCached(key, data);
      revalidateCb(data);
      return data;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
