/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Idempotency Backend Abstraction
 *
 * Provides an interface for pluggable storage backends that can be used
 * with the idempotency cache system. This allows switching between:
 * - InMemoryBackend (default, single-process)
 * - RedisBackend (distributed, production scale)
 * - Custom implementations
 *
 * Design patterns:
 * - Backend-agnostic interface: IdempotencyBackend
 * - Factory pattern for initialization
 * - Type-safe configuration
 */

export interface IdempotencyEntry {
  key: string;
  toolName: string;
  request: unknown;
  response?: unknown;
  error?: string;
  state: "processing" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  expiresAt: number;
}

/**
 * Backend interface for idempotency storage
 */
export interface IdempotencyBackend {
  /**
   * Store a new request in processing state
   */
  setProcessing(
    key: string,
    toolName: string,
    request: unknown,
    ttlMs: number,
  ): Promise<void>;

  /**
   * Retrieve an entry by key
   */
  get(key: string): Promise<IdempotencyEntry | undefined>;

  /**
   * Mark a request as completed with response
   */
  recordSuccess(
    key: string,
    response: unknown,
  ): Promise<void>;

  /**
   * Mark a request as failed with error
   */
  recordFailure(
    key: string,
    error: string,
  ): Promise<void>;

  /**
   * Delete an entry
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<{
    size: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
  }>;

  /**
   * Cleanup resources (e.g., stop timers, close connections)
   */
  destroy(): Promise<void>;
}

/**
 * In-Memory Backend Implementation
 *
 * Uses a Map for storage with TTL-based expiration.
 * Suitable for single-process deployments.
 */
export class InMemoryIdempotencyBackend implements IdempotencyBackend {
  private cache = new Map<string, IdempotencyEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupInterval();
  }

  async setProcessing(
    key: string,
    toolName: string,
    request: unknown,
    ttlMs: number,
  ): Promise<void> {
    const entry: IdempotencyEntry = {
      key,
      toolName,
      request,
      state: "processing",
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    this.cache.set(key, entry);
  }

  async get(key: string): Promise<IdempotencyEntry | undefined> {
    return this.cache.get(key);
  }

  async recordSuccess(
    key: string,
    response: unknown,
  ): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      entry.state = "completed";
      entry.response = response;
      entry.completedAt = Date.now();
    }
  }

  async recordFailure(
    key: string,
    error: string,
  ): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      entry.state = "failed";
      entry.error = error;
      entry.completedAt = Date.now();
    }
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async getStats(): Promise<{
    size: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    let processingCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    const values = Array.from(this.cache.values());
    for (let i = 0; i < values.length; i++) {
      const entry = values[i];
      if (entry.state === "processing") processingCount++;
      else if (entry.state === "completed") completedCount++;
      else if (entry.state === "failed") failedCount++;
    }

    return {
      size: this.cache.size,
      processingCount,
      completedCount,
      failedCount,
    };
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    const entries = Array.from(this.cache.entries());
    for (let i = 0; i < entries.length; i++) {
      const [key, entry] = entries[i];
      if (entry.expiresAt <= now) {
        keysToDelete.push(key);
      }
    }

    for (let i = 0; i < keysToDelete.length; i++) {
      this.cache.delete(keysToDelete[i]);
    }
  }
}

/**
 * Redis Backend Implementation (Optional)
 *
 * For distributed deployments where multiple processes need
 * to share idempotency cache. Requires redis npm package.
 *
 * Usage:
 *   const backend = await RedisIdempotencyBackend.create({
 *     host: 'redis.internal',
 *     port: 6379,
 *   });
 */
export class RedisIdempotencyBackend implements IdempotencyBackend {
  private client: any; // Redis client - type depends on redis version
  private readonly prefix = "idempotent:";

  private constructor(client: any) {
    this.client = client;
  }

  /**
   * Factory method to create and connect a Redis backend
   */
  static async create(options: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    prefix?: string;
  }): Promise<RedisIdempotencyBackend> {
    // Lazy load redis to keep it optional
    try {
      // @ts-ignore - redis is optional dependency
      const redis = await import("redis");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const client = redis.createClient({
        host: options.host || "localhost",
        port: options.port || 6379,
        password: options.password,
        db: options.db || 0,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await client.connect();
      const backend = new RedisIdempotencyBackend(client);
      if (options.prefix) {
        (backend as any).prefix = options.prefix;
      }
      return backend;
    } catch (error) {
      throw new Error(
        `Failed to create Redis backend: ${error instanceof Error ? error.message : String(error)}. ` +
          `Ensure 'redis' package is installed: npm install redis`,
      );
    }
  }

  async setProcessing(
    key: string,
    toolName: string,
    request: unknown,
    ttlMs: number,
  ): Promise<void> {
    const entry: IdempotencyEntry = {
      key,
      toolName,
      request,
      state: "processing",
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    const redisKey = `${this.prefix}${key}`;
    await this.client.setEx(
      redisKey,
      Math.ceil(ttlMs / 1000),
      JSON.stringify(entry),
    );
  }

  async get(key: string): Promise<IdempotencyEntry | undefined> {
    const redisKey = `${this.prefix}${key}`;
    const value = await this.client.get(redisKey);

    if (!value) {
      return undefined;
    }

    try {
      return JSON.parse(value) as IdempotencyEntry;
    } catch {
      return undefined;
    }
  }

  async recordSuccess(
    key: string,
    response: unknown,
  ): Promise<void> {
    const entry = await this.get(key);
    if (!entry) {
      return;
    }

    entry.state = "completed";
    entry.response = response;
    entry.completedAt = Date.now();

    const redisKey = `${this.prefix}${key}`;
    const ttlSeconds = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    if (ttlSeconds > 0) {
      await this.client.setEx(
        redisKey,
        ttlSeconds,
        JSON.stringify(entry),
      );
    }
  }

  async recordFailure(
    key: string,
    error: string,
  ): Promise<void> {
    const entry = await this.get(key);
    if (!entry) {
      return;
    }

    entry.state = "failed";
    entry.error = error;
    entry.completedAt = Date.now();

    const redisKey = `${this.prefix}${key}`;
    const ttlSeconds = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    if (ttlSeconds > 0) {
      await this.client.setEx(
        redisKey,
        ttlSeconds,
        JSON.stringify(entry),
      );
    }
  }

  async delete(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    await this.client.del(redisKey);
  }

  async clear(): Promise<void> {
    const pattern = `${this.prefix}*`;
    const keys = await this.client.keys(pattern);

    if (keys.length > 0) {
      for (let i = 0; i < keys.length; i++) {
        await this.client.del(keys[i]);
      }
    }
  }

  async getStats(): Promise<{
    size: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    const pattern = `${this.prefix}*`;
    const keys = await this.client.keys(pattern);

    let processingCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < keys.length; i++) {
      const value = await this.client.get(keys[i]);
      if (value) {
        try {
          const entry = JSON.parse(value) as IdempotencyEntry;
          if (entry.state === "processing") processingCount++;
          else if (entry.state === "completed") completedCount++;
          else if (entry.state === "failed") failedCount++;
        } catch {
          // Skip malformed entries
        }
      }
    }

    return {
      size: keys.length,
      processingCount,
      completedCount,
      failedCount,
    };
  }

  async destroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}

/**
 * Factory function to create appropriate backend based on configuration
 */
export async function createIdempotencyBackend(config?: {
  backend?: "memory" | "redis";
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
}): Promise<IdempotencyBackend> {
  const backendType = config?.backend || "memory";

  if (backendType === "redis") {
    return RedisIdempotencyBackend.create(config?.redis || {});
  }

  return new InMemoryIdempotencyBackend();
}
