type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccessAt: number;
};

const MAX_ENTRIES = 128;

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function evictIfNeeded() {
  while (cache.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of cache) {
      if (entry.lastAccessAt < oldestAccess) {
        oldestAccess = entry.lastAccessAt;
        oldestKey = key;
      }
    }

    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export async function cachedPropertyRead<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);

  if (hit && hit.expiresAt > now) {
    hit.lastAccessAt = now;
    return hit.value as T;
  }

  if (hit) cache.delete(key);

  const active = inFlight.get(key);
  if (active) return active as Promise<T>;

  const promise = loader()
    .then((value) => {
      evictIfNeeded();
      const storedAt = Date.now();
      cache.set(key, {
        value,
        expiresAt: storedAt + ttlMs,
        lastAccessAt: storedAt,
      });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export function clearPropertyReadCache() {
  cache.clear();
}
