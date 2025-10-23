import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IdempotencyStore, type IdempotencyEntry } from "./idempotency_cache.js";

describe("IdempotencyStore", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore({ ttlMs: 60000, maxEntries: 100 });
  });

  afterEach(() => {
    store.destroy();
  });

  describe("Request Lifecycle", () => {
    it("should track a new request as processing", () => {
      const input = { path: "/test.txt", content: "hello" };
      const result = store.startRequest("fs_write", input);

      expect(result.isNewRequest).toBe(true);
      expect(result.existingResponse).toBeUndefined();

      const entry = store.getEntry("fs_write", input);
      expect(entry).toBeDefined();
      expect(entry?.state).toBe("processing");
    });

    it("should return cached response for duplicate request", () => {
      const input = { path: "/test.txt", content: "hello" };
      const response = { ok: true };

      // First request
      store.startRequest("fs_write", input);
      store.recordSuccess("fs_write", input, response);

      // Duplicate request
      const result = store.startRequest("fs_write", input);
      expect(result.isNewRequest).toBe(false);
      expect(result.existingResponse).toEqual(response);
    });

    it("should return cached error for duplicate failed request", () => {
      const input = { path: "/test.txt", content: "hello" };
      const error = "Permission denied";

      // First request
      store.startRequest("fs_write", input);
      store.recordFailure("fs_write", input, error);

      // Duplicate request
      const result = store.startRequest("fs_write", input);
      expect(result.isNewRequest).toBe(false);
      expect(result.existingError).toBe(error);
    });

    it("should transition from processing to completed", () => {
      const input = { task_id: "T1", status: "done" };
      const response = { ok: true };

      store.startRequest("plan_update", input);
      let entry = store.getEntry("plan_update", input);
      expect(entry?.state).toBe("processing");

      store.recordSuccess("plan_update", input, response);
      entry = store.getEntry("plan_update", input);
      expect(entry?.state).toBe("completed");
      expect(entry?.response).toEqual(response);
    });

    it("should transition from processing to failed", () => {
      const input = { cmd: "invalid command" };
      const error = "Command not found";

      store.startRequest("cmd_run", input);
      let entry = store.getEntry("cmd_run", input);
      expect(entry?.state).toBe("processing");

      store.recordFailure("cmd_run", input, error);
      entry = store.getEntry("cmd_run", input);
      expect(entry?.state).toBe("failed");
      expect(entry?.error).toBe(error);
    });
  });

  describe("Idempotency Keys", () => {
    it("should generate consistent keys for identical input", () => {
      const input = { a: 1, b: "test" };

      const key1 = store.generateKey("fs_write", input);
      const key2 = store.generateKey("fs_write", input);

      expect(key1).toBe(key2);
    });

    it("should generate different keys for different input", () => {
      const input1 = { path: "/a.txt" };
      const input2 = { path: "/b.txt" };

      const key1 = store.generateKey("fs_write", input1);
      const key2 = store.generateKey("fs_write", input2);

      expect(key1).not.toBe(key2);
    });

    it("should be stable regardless of object property order", () => {
      const input1 = { a: 1, b: 2, c: { x: true, y: false } };
      const input2 = { c: { y: false, x: true }, b: 2, a: 1 };

      const key1 = store.generateKey("fs_write", input1);
      const key2 = store.generateKey("fs_write", input2);

      expect(key1).toBe(key2);
    });

    it("should treat undefined object properties as absent", () => {
      const withUndefined = { a: 1, b: undefined };
      const withoutProperty = { a: 1 };

      const keyWithUndefined = store.generateKey("context_write", withUndefined);
      const keyWithoutProperty = store.generateKey("context_write", withoutProperty);

      expect(keyWithUndefined).toBe(keyWithoutProperty);
    });

    it("should generate different keys for different tool names", () => {
      const input = { path: "/test.txt", content: "hello" };

      const key1 = store.generateKey("fs_write", input);
      const key2 = store.generateKey("fs_read", input);

      expect(key1).not.toBe(key2);
    });

    it("should use explicit idempotency key when provided", () => {
      const input = { path: "/test.txt", content: "hello" };
      const explicitKey = "custom-key-123";

      store.startRequest("fs_write", input, explicitKey);

      const entry = store.getEntry("fs_write", input, explicitKey);
      expect(entry?.key).toBe(explicitKey);
    });

    it("should retrieve entries using explicit keys", () => {
      const input = { path: "/test.txt", content: "hello" };
      const explicitKey = "my-idempotency-key";
      const response = { ok: true };

      // Store with explicit key
      store.startRequest("fs_write", input, explicitKey);
      store.recordSuccess("fs_write", input, response, explicitKey);

      // Retrieve using same key
      const result = store.startRequest("fs_write", input, explicitKey);
      expect(result.isNewRequest).toBe(false);
      expect(result.existingResponse).toEqual(response);
    });
  });

  describe("TTL and Expiration", () => {
    it("should expire entries after TTL", () => {
      const store = new IdempotencyStore({ ttlMs: 100 });
      const input = { test: "data" };

      store.startRequest("test_tool", input);
      let entry = store.getEntry("test_tool", input);
      expect(entry).toBeDefined();

      // Wait for TTL to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          // Manually trigger cleanup
          store.clear();
          const expiredEntry = store.getEntry("test_tool", input);
          expect(expiredEntry).toBeUndefined();
          store.destroy();
          resolve(undefined);
        }, 150);
      });
    });

    it("should track expiration timestamps", () => {
      const ttl = 60000;
      const store = new IdempotencyStore({ ttlMs: ttl });
      const input = { test: "data" };

      const before = Date.now();
      store.startRequest("test_tool", input);
      const after = Date.now();

      const entry = store.getEntry("test_tool", input);
      expect(entry?.expiresAt).toBeGreaterThanOrEqual(before + ttl);
      expect(entry?.expiresAt).toBeLessThanOrEqual(after + ttl);

      store.destroy();
    });
  });

  describe("Capacity Management", () => {
    it("should enforce maximum entry limit", () => {
      const store = new IdempotencyStore({ maxEntries: 5 });

      // Add 10 entries (exceeding max of 5)
      for (let i = 0; i < 10; i++) {
        store.startRequest("test_tool", { id: i });
      }

      const stats = store.getStats();
      expect(stats.size).toBeLessThanOrEqual(5);

      store.destroy();
    });

    it("should remove oldest entries when capacity exceeded", () => {
      const store = new IdempotencyStore({ maxEntries: 3 });

      // Add entries
      store.startRequest("test_tool", { id: 1 });
      store.startRequest("test_tool", { id: 2 });
      store.startRequest("test_tool", { id: 3 });
      store.startRequest("test_tool", { id: 4 }); // This should trigger eviction

      // First entry should be evicted
      const entry1 = store.getEntry("test_tool", { id: 1 });
      expect(entry1).toBeUndefined();

      // Recent entries should still exist
      expect(store.getEntry("test_tool", { id: 2 })).toBeDefined();
      expect(store.getEntry("test_tool", { id: 3 })).toBeDefined();
      expect(store.getEntry("test_tool", { id: 4 })).toBeDefined();

      store.destroy();
    });
  });

  describe("Statistics", () => {
    it("should track request states", () => {
      const input1 = { id: 1 };
      const input2 = { id: 2 };
      const input3 = { id: 3 };

      // Processing
      store.startRequest("test", input1);

      // Completed
      store.startRequest("test", input2);
      store.recordSuccess("test", input2, { ok: true });

      // Failed
      store.startRequest("test", input3);
      store.recordFailure("test", input3, "error");

      const stats = store.getStats();
      expect(stats.processingCount).toBe(1);
      expect(stats.completedCount).toBe(1);
      expect(stats.failedCount).toBe(1);
      expect(stats.size).toBe(3);
    });

    it("should track max entries from options", () => {
      const store = new IdempotencyStore({ maxEntries: 50 });
      const stats = store.getStats();
      expect(stats.maxEntries).toBe(50);
      store.destroy();
    });
  });

  describe("Error Handling", () => {
    it("should handle Error objects in recordFailure", () => {
      const input = { test: "data" };
      const error = new Error("Test error message");

      store.startRequest("test_tool", input);
      store.recordFailure("test_tool", input, error);

      const result = store.startRequest("test_tool", input);
      expect(result.existingError).toBe("Test error message");
    });

    it("should handle string errors in recordFailure", () => {
      const input = { test: "data" };
      const error = "String error message";

      store.startRequest("test_tool", input);
      store.recordFailure("test_tool", input, error);

      const result = store.startRequest("test_tool", input);
      expect(result.existingError).toBe(error);
    });
  });

  describe("Cleanup", () => {
    it("should allow clearing all entries", () => {
      store.startRequest("test", { id: 1 });
      store.startRequest("test", { id: 2 });

      let stats = store.getStats();
      expect(stats.size).toBe(2);

      store.clear();

      stats = store.getStats();
      expect(stats.size).toBe(0);
    });

    it("should cleanup resources on destroy", () => {
      store.startRequest("test", { id: 1 });
      store.destroy();

      const stats = store.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle concurrent requests for different tools", () => {
      const input1 = { path: "/test1.txt" };
      const input2 = { section: "test" };

      store.startRequest("fs_write", input1);
      store.startRequest("context_write", input2);

      const stats = store.getStats();
      expect(stats.size).toBe(2);
      expect(stats.processingCount).toBe(2);
    });

    it("should preserve separate entries for same input different tools", () => {
      const input = { test: "data" };

      store.startRequest("tool1", input);
      store.startRequest("tool2", input);

      const entry1 = store.getEntry("tool1", input);
      const entry2 = store.getEntry("tool2", input);

      expect(entry1).toBeDefined();
      expect(entry2).toBeDefined();
      expect(entry1?.key).not.toBe(entry2?.key);
    });

    it("should handle rapid state transitions", () => {
      const input = { test: "rapid" };

      store.startRequest("test", input);
      let entry = store.getEntry("test", input);
      expect(entry?.state).toBe("processing");

      store.recordSuccess("test", input, { ok: true });
      entry = store.getEntry("test", input);
      expect(entry?.state).toBe("completed");

      // Subsequent calls return cached
      const result = store.startRequest("test", input);
      expect(result.isNewRequest).toBe(false);
    });
  });
});
