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

export interface CacheKeyInfo {
  key: string;
  ttlRemainingSeconds: number;
  expiresAt: string;
  createdAt: string;
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
   * Check if a valid (non-expired) cache key exists without triggering a hit count
   */
  static has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Return number of currently cached keys
   */
  static size(): number {
    this.cleanExpired();
    return this.store.size;
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
   * Clean expired keys
   */
  private static cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Retrieve active cache keys and metadata
   */
  static getKeys(): CacheKeyInfo[] {
    this.cleanExpired();
    const now = Date.now();
    const list: CacheKeyInfo[] = [];

    for (const [key, entry] of this.store.entries()) {
      const ttlRemainingSeconds = Math.max(0, Math.round((entry.expiresAt - now) / 1000));
      list.push({
        key,
        ttlRemainingSeconds,
        expiresAt: new Date(entry.expiresAt).toISOString(),
        createdAt: new Date(entry.createdAt).toISOString(),
        hits: entry.hits,
        sizeBytes: entry.sizeBytes,
      });
    }

    return list;
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
