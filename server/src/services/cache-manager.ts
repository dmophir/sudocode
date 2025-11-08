/**
 * Cache Manager Service
 * Phase 6: Performance optimization through intelligent caching
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hit_rate: number; // percentage
}

/**
 * Cache Manager
 * Provides in-memory caching with TTL support
 */
export class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private stats: {
    hits: number;
    misses: number;
  };
  private defaultTTL: number;
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(options?: { defaultTTL?: number; maxSize?: number }) {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
    this.defaultTTL = options?.defaultTTL ?? 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options?.maxSize ?? 1000; // Max 1000 entries
    this.cleanupInterval = null;

    // Start periodic cleanup every 60 seconds
    this.startCleanup();
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // Check if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest entry
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    let count = 0;
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hit_rate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Get or set pattern: fetch from cache or execute function and cache result
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // Every 60 seconds
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[cache-manager] Cleaned up ${removedCount} expired entries`);
    }
  }

  /**
   * Evict oldest entry when cache is full
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

/**
 * Global cache instance
 */
let globalCache: CacheManager | null = null;

/**
 * Get global cache instance
 */
export function getCacheManager(): CacheManager {
  if (!globalCache) {
    globalCache = new CacheManager({
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxSize: 1000,
    });
  }
  return globalCache;
}

/**
 * Project Analysis Cache Keys
 */
export const CacheKeys = {
  SPEC_LIST: "spec:list",
  SPEC_DETAIL: (specId: string) => `spec:${specId}`,
  ISSUE_LIST: "issue:list",
  ISSUE_DETAIL: (issueId: string) => `issue:${issueId}`,
  ISSUE_READY: "issue:ready",
  EXECUTION_LIST: "execution:list",
  EXECUTION_DETAIL: (executionId: string) => `execution:${executionId}`,
  PROJECT_ANALYSIS: "project:analysis",
  FEEDBACK_LIST: (entityType: string, entityId: string) =>
    `feedback:${entityType}:${entityId}`,
  RELATIONSHIPS: (entityType: string, entityId: string) =>
    `relationships:${entityType}:${entityId}`,
};

/**
 * Invalidate cache on entity changes
 */
export function invalidateEntityCache(
  entityType: "spec" | "issue" | "execution" | "feedback" | "relationship",
  entityId?: string
) {
  const cache = getCacheManager();

  switch (entityType) {
    case "spec":
      cache.invalidatePattern(/^spec:/);
      cache.delete(CacheKeys.PROJECT_ANALYSIS);
      break;
    case "issue":
      cache.invalidatePattern(/^issue:/);
      cache.delete(CacheKeys.PROJECT_ANALYSIS);
      break;
    case "execution":
      cache.invalidatePattern(/^execution:/);
      cache.delete(CacheKeys.PROJECT_ANALYSIS);
      break;
    case "feedback":
      if (entityId) {
        cache.invalidatePattern(new RegExp(`^feedback:.*:${entityId}`));
      } else {
        cache.invalidatePattern(/^feedback:/);
      }
      break;
    case "relationship":
      if (entityId) {
        cache.invalidatePattern(new RegExp(`^relationships:.*:${entityId}`));
      } else {
        cache.invalidatePattern(/^relationships:/);
      }
      cache.delete(CacheKeys.PROJECT_ANALYSIS);
      break;
  }
}
