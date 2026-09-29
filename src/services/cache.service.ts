/**
 * High-Speed In-Memory Cache Service
 * Provides sub-millisecond retrieval of frequent queries (cohorts, peers, placements, repos)
 * to avoid repeated remote database round-trips.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
  sizeBytes: number;
}

export class CacheService {
  private static store = new Map<string, CacheEntry<any>>();
  private static hits = 0;
  private static misses = 0;
  private static sets = 0;
  private static deletes = 0;
  private static startTime = Date.now();

  /**
   * Retrieve cached value if present and not expired
   */
  static get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.hits++;
    return entry.value as T;
  }

  /**
   * Set value in cache with TTL in seconds
   */
  static set<T>(key: string, value: T, ttlSeconds: number = 120): void {
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    let sizeBytes = 0;
    try {
      sizeBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      sizeBytes = 256;
    }

    this.store.set(key, {
      value,
      expiresAt,
      createdAt: now,
      hits: 0,
      sizeBytes,
    });
    this.sets++;
  }

  /**
   * Invalidate a specific cache key
   */
  static del(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix or pattern
   */
  static invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Wrapper function: returns cached value or executes fn, caches result, and returns it.
   */
  static async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fn();
    if (fresh !== null && fresh !== undefined) {
      this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }
}
