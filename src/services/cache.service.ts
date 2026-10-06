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

export interface CacheStats {
  status: 'active' | 'degraded' | 'idle';
  totalKeys: number;
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRatio: string;
  hitRatioPercentage: number;
  memoryUsageEstimateBytes: number;
  uptimeSeconds: number;
  defaultTTL: number;
  keys: CacheKeyInfo[];
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
  static del(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) this.deletes++;
    return deleted;
  }

  /**
   * Invalidate all keys matching a prefix or pattern
   */
  static invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        this.deletes++;
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cached keys
   */
  static clear(): number {
    const count = this.store.size;
    this.deletes += count;
    this.store.clear();
    return count;
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
   * Get comprehensive telemetry and performance stats
   */
  static getStats(): CacheStats {
    this.cleanExpired();
    const keys = this.getKeys();
    const totalRequests = this.hits + this.misses;
    const hitRatioPercentage = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
    const memoryUsageEstimateBytes = keys.reduce((acc, k) => acc + k.sizeBytes, 0);

    return {
      status: this.store.size > 0 ? 'active' : 'idle',
      totalKeys: this.store.size,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      hitRatio: `${hitRatioPercentage.toFixed(1)}%`,
      hitRatioPercentage: Math.round(hitRatioPercentage * 10) / 10,
      memoryUsageEstimateBytes,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      defaultTTL: 120,
      keys,
    };
  }

  /**
   * Reset telemetry counters
   */
  static resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
    this.startTime = Date.now();
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
