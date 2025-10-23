import { createHash } from "crypto";

/**
 * Idempotency Cache Store
 *
 * Implements request deduplication for mutating tools using idempotency keys.
 * Prevents duplicate operations when requests are retried.
 *
 * Design:
 * - In-memory cache with TTL-based expiration (default 1 hour)
 * - Supports both explicit keys (provided by client) and content-hash keys (generated)
 * - Tracks request state: processing, completed, or failed
 * - Preserves previous response to return on duplicate requests
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

interface IdempotencyStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
}

export class IdempotencyStore {
  private cache = new Map<string, IdempotencyEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options?: IdempotencyStoreOptions) {
    this.ttlMs = options?.ttlMs ?? 3600000; // 1 hour default
    this.maxEntries = options?.maxEntries ?? 10000;
    this.startCleanupInterval();
  }

  /**
   * Generate a deterministic key from request content if no explicit key provided
   */
  generateKey(toolName: string, input: unknown): string {
    const contentHash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    return `${toolName}:content:${contentHash}`;
  }

  /**
   * Record the start of a request processing
   * Returns true if this is a new request, false if it was already processing
   */
  startRequest(
    toolName: string,
    input: unknown,
    idempotencyKey?: string,
  ): { isNewRequest: boolean; existingResponse?: unknown; existingError?: string } {
    const key = idempotencyKey || this.generateKey(toolName, input);

    const existing = this.cache.get(key);

    // If already completed, return the previous response
    if (existing) {
      if (existing.state === "completed") {
        return { isNewRequest: false, existingResponse: existing.response };
      } else if (existing.state === "failed") {
        return { isNewRequest: false, existingError: existing.error };
      }
      // If still processing, treat as new request but will detect during response
      // This handles concurrent retries of the same request
    }

    // Record that we're processing this request
    const entry: IdempotencyEntry = {
      key,
      toolName,
      request: input,
      state: "processing",
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };

    this.cache.set(key, entry);
    this.enforceCapacity();

    return { isNewRequest: true };
  }

  /**
   * Record successful completion of a request
   */
  recordSuccess(
    toolName: string,
    input: unknown,
    response: unknown,
    idempotencyKey?: string,
  ): void {
    const key = idempotencyKey || this.generateKey(toolName, input);
    const entry = this.cache.get(key);

    if (!entry) return;

    entry.state = "completed";
    entry.response = response;
    entry.completedAt = Date.now();
  }

  /**
   * Record failure of a request
   */
  recordFailure(
    toolName: string,
    input: unknown,
    error: string | Error,
    idempotencyKey?: string,
  ): void {
    const key = idempotencyKey || this.generateKey(toolName, input);
    const entry = this.cache.get(key);

    if (!entry) return;

    entry.state = "failed";
    entry.error = error instanceof Error ? error.message : error;
    entry.completedAt = Date.now();
  }

  /**
   * Get the current state of a cached request
   */
  getEntry(
    toolName: string,
    input: unknown,
    idempotencyKey?: string,
  ): IdempotencyEntry | undefined {
    const key = idempotencyKey || this.generateKey(toolName, input);
    return this.cache.get(key);
  }

  /**
   * Clear all expired entries from the cache
   */
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

  /**
   * Enforce maximum cache size by removing oldest entries
   */
  private enforceCapacity(): void {
    if (this.cache.size > this.maxEntries) {
      // Remove oldest entries (FIFO)
      const entriesToRemove = this.cache.size - this.maxEntries;
      const entries = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt,
      );

      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    // Allow the interval to not prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
  } {
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
      maxEntries: this.maxEntries,
      processingCount,
      completedCount,
      failedCount,
    };
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}
