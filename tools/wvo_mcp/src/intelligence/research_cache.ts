import crypto from 'node:crypto';

export interface ResearchCacheEntry<T = unknown> {
  key: string;
  value: T;
  storedAt: number;
  expiresAt: number;
}

export interface ResearchCacheOptions {
  ttlMs?: number;
  now?: () => number;
}

/**
 * Simple in-memory research cache.
 * The real implementation will persist to SQLite, but this keeps
 * the interface stable while the feature flag remains off.
 */
export class ResearchCache<T = unknown> {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly store = new Map<string, ResearchCacheEntry<T>>();

  constructor(options: ResearchCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 90 * 24 * 60 * 60 * 1000; // 90 days
    this.now = options.now ?? Date.now;
  }

  static createKey(parts: unknown[]): string {
    const serialized = JSON.stringify(parts);
    return crypto.createHash('sha1').update(serialized).digest('hex');
  }

  get(key: string): ResearchCacheEntry<T> | undefined {
    const existing = this.store.get(key);
    if (!existing) return undefined;
    if (existing.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return existing;
  }

  set(key: string, value: T, ttlOverrideMs?: number): ResearchCacheEntry<T> {
    const started = this.now();
    const expiresAt = started + (ttlOverrideMs ?? this.ttlMs);
    const entry: ResearchCacheEntry<T> = {
      key,
      value,
      storedAt: started,
      expiresAt,
    };
    this.store.set(key, entry);
    return entry;
  }

  upsert(key: string, compute: () => T, ttlOverrideMs?: number): ResearchCacheEntry<T> {
    const cached = this.get(key);
    if (cached) {
      return cached;
    }
    const value = compute();
    return this.set(key, value, ttlOverrideMs);
  }

  prune(): void {
    const now = this.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}
