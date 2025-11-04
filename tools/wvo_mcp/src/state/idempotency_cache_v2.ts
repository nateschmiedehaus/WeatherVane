/**
 * Idempotency Cache v2 - Backend-Agnostic Implementation
 *
 * Enhanced version that uses the pluggable backend abstraction,
 * enabling both in-memory and distributed (Redis) backends.
 *
 * Design:
 * - Abstraction layer over storage backend
 * - Content-hash deduplication with stable key generation
 * - TTL-based expiration management
 * - Comprehensive statistics tracking
 * - Zero breaking changes to existing API
 */

import { createHash } from "crypto";

import {
  type IdempotencyBackend,
  type IdempotencyEntry,
  InMemoryIdempotencyBackend,
  createIdempotencyBackend,
} from "./idempotency_backend.js";

/**
 * Create a deterministic JSON representation for hashing
 */
function canonicalizeForHash(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;

  if (valueType === "undefined") {
    return null;
  }
  if (valueType === "bigint") {
    return (value as bigint).toString();
  }
  if (valueType === "number") {
    if (!Number.isFinite(value as number)) {
      return String(value);
    }
    return value;
  }
  if (valueType === "string" || valueType === "boolean") {
    return value;
  }
  if (valueType === "symbol") {
    return (value as symbol).toString();
  }
  if (valueType === "function") {
    const fn = value as () => unknown;
    return `[Function:${fn.name || "anonymous"}]`;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular:Array]";
    }
    seen.add(value);
    const normalisedArray = value.map((item) => canonicalizeForHash(item, seen));
    seen.delete(value);
    return normalisedArray;
  }

  if (value instanceof Date) {
    return value.toJSON();
  }

  if (value instanceof Set) {
    if (seen.has(value)) {
      return "[Circular:Set]";
    }
    seen.add(value);
    const normalisedSet = Array.from(value.values())
      .map((item) => canonicalizeForHash(item, seen))
      .sort();
    seen.delete(value);
    return normalisedSet;
  }

  if (value instanceof Map) {
    if (seen.has(value)) {
      return "[Circular:Map]";
    }
    seen.add(value);
    const normalisedMap = Array.from(value.entries())
      .map(([key, val]) => [
        canonicalizeForHash(key, seen),
        canonicalizeForHash(val, seen),
      ])
      .sort(([a], [b]) => {
        const left = typeof a === "string" ? a : JSON.stringify(a);
        const right = typeof b === "string" ? b : JSON.stringify(b);
        return left < right ? -1 : left > right ? 1 : 0;
      });
    seen.delete(value);
    return normalisedMap;
  }

  if (value && typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular:Object]";
    }
    seen.add(value as object);
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, val]) => typeof val !== "undefined")
      .map(([key, val]) => [key, canonicalizeForHash(val, seen)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const normalised: Record<string, unknown> = {};
    for (let i = 0; i < entries.length; i++) {
      const [key, val] = entries[i];
      normalised[key] = val;
    }
    seen.delete(value as object);
    return normalised;
  }

  return value;
}

function stableStringify(input: unknown): string {
  const normalised = canonicalizeForHash(input);
  const json = JSON.stringify(normalised);
  return typeof json === "string" ? json : String(normalised);
}

export interface IdempotencyCacheOptions {
  ttlMs?: number;
  backend?: IdempotencyBackend;
  backendType?: "memory" | "redis";
  redisConfig?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
}

/**
 * Idempotency Cache with pluggable backend support
 *
 * This is the v2 implementation that maintains backward compatibility
 * with the original IdempotencyStore while adding support for
 * distributed backends.
 */
export class IdempotencyCacheV2 {
  private backend: IdempotencyBackend;
  private readonly ttlMs: number;

  private constructor(
    backend: IdempotencyBackend,
    ttlMs: number,
  ) {
    this.backend = backend;
    this.ttlMs = ttlMs;
  }

  /**
   * Create a new cache with specified backend
   */
  static async create(options?: IdempotencyCacheOptions): Promise<IdempotencyCacheV2> {
    const ttlMs = options?.ttlMs ?? 3600000; // 1 hour default
    let backend = options?.backend;

    if (!backend) {
      backend = await createIdempotencyBackend({
        backend: options?.backendType || "memory",
        redis: options?.redisConfig,
      });
    }

    return new IdempotencyCacheV2(backend, ttlMs);
  }

  /**
   * Generate a deterministic key from request content
   */
  generateKey(toolName: string, input: unknown): string {
    const contentHash = createHash("sha256")
      .update(stableStringify(input))
      .digest("hex");
    return `${toolName}:content:${contentHash}`;
  }

  /**
   * Record the start of request processing
   */
  async startRequest(
    toolName: string,
    input: unknown,
    idempotencyKey?: string,
  ): Promise<{
    isNewRequest: boolean;
    existingResponse?: unknown;
    existingError?: string;
  }> {
    const key = idempotencyKey || this.generateKey(toolName, input);

    const existing = await this.backend.get(key);

    if (existing) {
      if (existing.state === "completed") {
        return { isNewRequest: false, existingResponse: existing.response };
      } else if (existing.state === "failed") {
        return { isNewRequest: false, existingError: existing.error };
      }
    }

    await this.backend.setProcessing(key, toolName, input, this.ttlMs);
    return { isNewRequest: true };
  }

  /**
   * Record successful completion of a request
   */
  async recordSuccess(
    toolName: string,
    input: unknown,
    response: unknown,
    idempotencyKey?: string,
  ): Promise<void> {
    const key = idempotencyKey || this.generateKey(toolName, input);
    await this.backend.recordSuccess(key, response);
  }

  /**
   * Record failure of a request
   */
  async recordFailure(
    toolName: string,
    input: unknown,
    error: string | Error,
    idempotencyKey?: string,
  ): Promise<void> {
    const key = idempotencyKey || this.generateKey(toolName, input);
    const errorMsg = error instanceof Error ? error.message : error;
    await this.backend.recordFailure(key, errorMsg);
  }

  /**
   * Get the current state of a cached request
   */
  async getEntry(
    toolName: string,
    input: unknown,
    idempotencyKey?: string,
  ): Promise<IdempotencyEntry | undefined> {
    const key = idempotencyKey || this.generateKey(toolName, input);
    return this.backend.get(key);
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    await this.backend.clear();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
  }> {
    return this.backend.getStats();
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.backend.destroy();
  }
}

/**
 * Backward-compatible factory function
 */
export async function createIdempotencyCache(
  options?: IdempotencyCacheOptions,
): Promise<IdempotencyCacheV2> {
  return IdempotencyCacheV2.create(options);
}
