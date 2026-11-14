import type { RouteResult } from "../schemas/routing.schema.js";

type CacheEntry = { expiresAt: number; result: RouteResult };

export type RouteCache = {
  get: (key: string) => RouteResult | null;
  set: (key: string, result: RouteResult) => void;
  size: () => number;
};

/** Small LRU cache with TTL; keeps repeated OSRM lookups off the network. */
export function createRouteCache(options: { ttlMs: number; maxEntries?: number }): RouteCache {
  const maxEntries = options.maxEntries ?? 500;
  const cache = new Map<string, CacheEntry>();

  return {
    get(key: string): RouteResult | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
      }
      // Refresh LRU order.
      cache.delete(key);
      cache.set(key, entry);
      return { ...entry.result, source: "cache" };
    },
    set(key: string, result: RouteResult): void {
      if (cache.has(key)) cache.delete(key);
      while (cache.size >= maxEntries) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
      }
      cache.set(key, { expiresAt: Date.now() + options.ttlMs, result });
    },
    size: () => cache.size,
  };
}
