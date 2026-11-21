export interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
  generation?: number;
}

export const invalidateCache = <T>(entry: CacheEntry<T>): void => {
  entry.expiresAt = 0;
  entry.generation = (entry.generation ?? 0) + 1;
};

/** Coalesces concurrent reads and retains only successful responses. */
export const readCached = <T>(
  entry: CacheEntry<T>,
  read: () => Promise<T>,
  ttl: number,
  now = Date.now(),
): Promise<T> => {
  if (entry.pending) return entry.pending;
  if (entry.value !== undefined && entry.expiresAt > now) {
    return Promise.resolve(entry.value);
  }
  entry.pending = (async () => {
    for (;;) {
      const generation = entry.generation;
      const value = await read();
      // A mutation during the read requires a fresh response, not a stale badge.
      if (generation !== entry.generation) continue;
      entry.value = value;
      entry.expiresAt = Date.now() + ttl;
      return value;
    }
  })().finally(() => {
    entry.pending = undefined;
  });
  return entry.pending;
};
