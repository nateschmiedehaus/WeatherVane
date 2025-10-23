import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IdempotencyStore } from "./idempotency_cache.js";
import {
  IdempotencyMiddleware,
  withIdempotency,
  type ToolHandler,
} from "./idempotency_middleware.js";

describe("IdempotencyMiddleware", () => {
  let store: IdempotencyStore;
  let middleware: IdempotencyMiddleware;

  beforeEach(() => {
    store = new IdempotencyStore({ ttlMs: 60000 });
    middleware = new IdempotencyMiddleware(store, true);
  });

  afterEach(() => {
    middleware.destroy();
  });

  describe("Handler Wrapping", () => {
    it("should execute handler for new requests", async () => {
      const handler = vi.fn(async (input: unknown) => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };
      const result = await wrapped(input);

      expect(handler).toHaveBeenCalledWith(input);
      expect(result).toEqual({ ok: true });
    });

    it("should not re-execute handler for duplicate requests", async () => {
      const handler = vi.fn(async (input: unknown) => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };

      // First call
      await wrapped(input);
      expect(handler).toHaveBeenCalledTimes(1);

      // Duplicate call
      const result = await wrapped(input);
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
      expect(result).toEqual({ ok: true });
    });

    it("should return cached response for duplicates", async () => {
      const response = { id: 123, ok: true };
      const handler = vi.fn(async () => response);
      const wrapped = middleware.wrap("test_tool", handler);

      const input = { test: "data" };

      // First request
      const result1 = await wrapped(input);
      expect(result1).toEqual(response);

      // Duplicate request - should return same response
      const result2 = await wrapped(input);
      expect(result2).toEqual(response);
      expect(result1).toBe(result2); // Same object reference
    });
  });

  describe("Idempotency Keys", () => {
    it("should use explicit idempotency key", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };
      const key = "explicit-key-123";

      // First call with key
      await wrapped(input, key);
      expect(handler).toHaveBeenCalledTimes(1);

      // Duplicate call with same key
      const result = await wrapped(input, key);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true });
    });

    it("should treat different keys as separate requests", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };

      // Same input, different keys
      await wrapped(input, "key1");
      await wrapped(input, "key2");

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error Handling", () => {
    it("should propagate handler errors", async () => {
      const error = new Error("Handler failed");
      const handler = vi.fn(async () => {
        throw error;
      });
      const wrapped = middleware.wrap("test_tool", handler);

      await expect(wrapped({ test: "data" })).rejects.toThrow("Handler failed");
    });

    it("should return cached error for duplicate failed requests", async () => {
      const error = new Error("Permission denied");
      const handler = vi.fn(async () => {
        throw error;
      });
      const wrapped = middleware.wrap("test_tool", handler);

      const input = { test: "data" };

      // First call - throws
      await expect(wrapped(input)).rejects.toThrow("Permission denied");
      expect(handler).toHaveBeenCalledTimes(1);

      // Duplicate call - returns cached error
      const cachedError = await wrapped(input).catch((e: unknown) => e as unknown) as Error;
      expect(cachedError.name).toBe("CachedIdempotencyError");
      expect(cachedError.message).toBe("Permission denied");

      // Handler not called again
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should distinguish between cached and fresh errors", async () => {
      let callCount = 0;
      const handler = vi.fn(async () => {
        callCount++;
        throw new Error(`Error ${callCount}`);
      });
      const wrapped = middleware.wrap("test_tool", handler);

      const input = { test: "data" };

      // First request fails
      await expect(wrapped(input)).rejects.toThrow("Error 1");

      // Duplicate request returns cached error
      const cachedError = await wrapped(input).catch((e: unknown) => e as unknown) as Error;
      expect(cachedError.message).toBe("Error 1"); // Not "Error 2"
    });
  });

  describe("Batch Operations", () => {
    it("should wrap multiple handlers", async () => {
      const handler1 = vi.fn(async () => ({ tool: "1" }));
      const handler2 = vi.fn(async () => ({ tool: "2" }));

      const handlers = new Map<string, ToolHandler>([
        ["tool1", handler1],
        ["tool2", handler2],
      ]);

      const wrapped = middleware.wrapHandlers(handlers);

      expect(wrapped.size).toBe(2);
      expect(wrapped.has("tool1")).toBe(true);
      expect(wrapped.has("tool2")).toBe(true);
    });

    it("should maintain independence of wrapped handlers", async () => {
      const handler1 = vi.fn(async () => ({ tool: "1" }));
      const handler2 = vi.fn(async () => ({ tool: "2" }));

      const handlers = new Map<string, ToolHandler>([
        ["tool1", handler1],
        ["tool2", handler2],
      ]);

      const wrapped = middleware.wrapHandlers(handlers);

      const input = { test: "data" };

      // Call same input on both tools
      await wrapped.get("tool1")!(input);
      await wrapped.get("tool1")!(input); // Duplicate, should be cached

      await wrapped.get("tool2")!(input);
      await wrapped.get("tool2")!(input); // Duplicate, should be cached

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Enable/Disable", () => {
    it("should skip idempotency when disabled", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const disabled = new IdempotencyMiddleware(store, false);
      const wrapped = disabled.wrap("test_tool", handler);

      const input = { test: "data" };

      // Even with identical inputs, handler is called twice
      await wrapped(input);
      await wrapped(input);

      expect(handler).toHaveBeenCalledTimes(2);

      disabled.destroy();
    });

    it("should execute handler normally when idempotency disabled", async () => {
      const disabled = new IdempotencyMiddleware(store, false);
      const handler = vi.fn(async (input: unknown) => {
        const parsed = input as Record<string, unknown>;
        return { ...parsed, processed: true };
      });
      const wrapped = disabled.wrap("test_tool", handler);

      const input = { test: "data" };
      const result = await wrapped(input);

      expect(result).toEqual({ test: "data", processed: true });

      disabled.destroy();
    });
  });

  describe("Statistics", () => {
    it("should provide cache statistics", async () => {
      const handler1 = vi.fn(async () => ({ ok: true }));
      const handler2 = vi.fn(async () => {
        throw new Error("Failed");
      });

      const wrapped1 = middleware.wrap("tool1", handler1);
      const wrapped2 = middleware.wrap("tool2", handler2);

      // Completed
      await wrapped1({ id: 1 });
      // Duplicate (cached)
      await wrapped1({ id: 1 });

      // Failed
      await wrapped2({ id: 2 }).catch(() => {});

      const stats = middleware.getStats();
      expect(stats.completedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.size).toBe(2);
    });
  });

  describe("withIdempotency Function", () => {
    it("should wrap handler with idempotency", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = withIdempotency("test_tool", handler, store);

      const input = { test: "data" };

      // First call
      const result1 = await wrapped(input);
      expect(result1).toEqual({ ok: true });

      // Duplicate call
      const result2 = await wrapped(input);
      expect(result2).toEqual({ ok: true });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should accept explicit idempotency key", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = withIdempotency("test_tool", handler, store);

      const input = { test: "data" };

      await wrapped(input, "key1");
      await wrapped(input, "key1");

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should work when disabled", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = withIdempotency("test_tool", handler, store, false);

      const input = { test: "data" };

      await wrapped(input);
      await wrapped(input);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle concurrent retries", async () => {
      const handler = vi.fn(async () => {
        // Simulate slow operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ok: true };
      });
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt", content: "data" };

      // Simulate concurrent retries
      const promises = [
        wrapped(input),
        wrapped(input),
        wrapped(input),
      ];

      const results = await Promise.all(promises);

      // All return same result
      expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);

      // All results should have the same structure
      expect(results[0]).toStrictEqual(results[1]);
      expect(results[1]).toStrictEqual(results[2]);
    });

    it("should track statistics for production monitoring", async () => {
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("test_tool", handler);

      for (let i = 0; i < 5; i++) {
        await wrapped({ id: i }); // 5 new requests
      }

      for (let i = 0; i < 3; i++) {
        await wrapped({ id: i }); // 3 duplicate requests
      }

      const stats = middleware.getStats();
      expect(stats.completedCount).toBe(5);
      expect(stats.size).toBe(5);
    });
  });

  describe("Integration with Tool Handlers", () => {
    it("should work with fs_write-like handler", async () => {
      const fsWriteHandler = async (input: unknown) => {
        const parsed = input as { path: string; content: string };
        // Simulate writing
        return { ok: true, path: parsed.path };
      };

      const wrapped = middleware.wrap("fs_write", fsWriteHandler);

      const input = { path: "/test.txt", content: "hello" };
      const result1 = await wrapped(input);
      const result2 = await wrapped(input);

      expect(result1).toEqual(result2);
    });

    it("should work with plan_update-like handler", async () => {
      const planUpdateHandler = async (input: unknown) => {
        const parsed = input as { task_id: string; status: string };
        return { ok: true, task_id: parsed.task_id };
      };

      const wrapped = middleware.wrap("plan_update", planUpdateHandler);

      const input = { task_id: "T1", status: "done" };
      const result1 = await wrapped(input);
      const result2 = await wrapped(input);

      expect(result1).toEqual(result2);
    });

    it("should work with context_write-like handler", async () => {
      const contextWriteHandler = async (input: unknown) => {
        const parsed = input as { section: string; content: string };
        // Simulate write
        return { ok: true };
      };

      const wrapped = middleware.wrap("context_write", contextWriteHandler);

      const input = { section: "Current Focus", content: "New status" };
      const result1 = await wrapped(input);
      const result2 = await wrapped(input);

      expect(result1).toEqual(result2);
    });
  });

  describe("DRY_RUN Mode Guardrail", () => {
    afterEach(() => {
      // Ensure WVO_DRY_RUN is unset after each test
      delete process.env.WVO_DRY_RUN;
      middleware.clear();
    });

    it("should skip caching when WVO_DRY_RUN=1", async () => {
      process.env.WVO_DRY_RUN = "1";
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };

      // Both calls should execute the handler (no caching in DRY_RUN)
      await wrapped(input);
      await wrapped(input);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should resume caching when WVO_DRY_RUN is unset", async () => {
      process.env.WVO_DRY_RUN = "0";
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };

      // Both calls should execute once due to caching
      await wrapped(input);
      await wrapped(input);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should avoid side effects during DRY_RUN canary runs", async () => {
      process.env.WVO_DRY_RUN = "1";
      let executionCount = 0;

      const handler = vi.fn(async () => {
        executionCount++;
        // This side effect should happen both times in DRY_RUN
        return { sideEffectExecuted: true, count: executionCount };
      });

      const wrapped = middleware.wrap("cmd_run", handler);
      const input = { cmd: "echo test" };

      // Both executions should run the handler
      const result1 = (await wrapped(input)) as { sideEffectExecuted: boolean; count: number };
      const result2 = (await wrapped(input)) as { sideEffectExecuted: boolean; count: number };

      // Verify side effects happened twice (not cached)
      expect(result1.count).toBe(1);
      expect(result2.count).toBe(2);
      expect(executionCount).toBe(2);
    });

    it("should protect cached responses when DRY_RUN disabled", async () => {
      delete process.env.WVO_DRY_RUN; // Ensure disabled
      let executionCount = 0;

      const handler = vi.fn(async () => {
        executionCount++;
        return { count: executionCount };
      });

      const wrapped = middleware.wrap("fs_write", handler);
      const input = { path: "/test.txt" };

      // First call
      const result1 = (await wrapped(input)) as { count: number };
      expect(result1.count).toBe(1);

      // Second call should use cache (not re-execute)
      const result2 = (await wrapped(input)) as { count: number };
      expect(result2.count).toBe(1); // Should still be 1, from cache
      expect(executionCount).toBe(1);
    });

    it("should not interfere with error handling in DRY_RUN", async () => {
      process.env.WVO_DRY_RUN = "1";
      const error = new Error("Test error");
      const handler = vi.fn(async () => {
        throw error;
      });

      const wrapped = middleware.wrap("test_tool", handler);
      const input = { test: "data" };

      // Both calls should throw (no caching in DRY_RUN)
      await expect(wrapped(input)).rejects.toThrow("Test error");
      await expect(wrapped(input)).rejects.toThrow("Test error");

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should work with explicit idempotency keys in DRY_RUN", async () => {
      process.env.WVO_DRY_RUN = "1";
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("fs_write", handler);

      const input = { path: "/test.txt" };
      const key = "my-key";

      // Even with explicit key, DRY_RUN bypasses cache
      await wrapped(input, key);
      await wrapped(input, key);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should document DRY_RUN behavior in statistics", async () => {
      process.env.WVO_DRY_RUN = "1";
      const handler = vi.fn(async () => ({ ok: true }));
      const wrapped = middleware.wrap("test_tool", handler);

      await wrapped({ id: 1 });
      await wrapped({ id: 1 });

      // In DRY_RUN mode, cache statistics may reflect behavior
      // but caching is disabled, so both executions happen
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
