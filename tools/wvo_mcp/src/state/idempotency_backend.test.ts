import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  InMemoryIdempotencyBackend,
  type IdempotencyEntry,
} from "./idempotency_backend.js";

describe("IdempotencyBackend Abstraction", () => {
  describe("InMemoryIdempotencyBackend", () => {
    let backend: InMemoryIdempotencyBackend;

    beforeEach(async () => {
      backend = new InMemoryIdempotencyBackend();
    });

    afterEach(async () => {
      await backend.destroy();
    });

    describe("Request Lifecycle", () => {
      it("should store processing request", async () => {
        const key = "test:1";
        const request = { path: "/test.txt", content: "hello" };

        await backend.setProcessing(key, "fs_write", request, 60000);

        const entry = await backend.get(key);
        expect(entry).toBeDefined();
        expect(entry?.state).toBe("processing");
        expect(entry?.toolName).toBe("fs_write");
        expect(entry?.request).toEqual(request);
      });

      it("should transition from processing to completed", async () => {
        const key = "test:complete";
        const request = { id: 1 };
        const response = { ok: true };

        await backend.setProcessing(key, "test_tool", request, 60000);
        let entry = await backend.get(key);
        expect(entry?.state).toBe("processing");

        await backend.recordSuccess(key, response);
        entry = await backend.get(key);
        expect(entry?.state).toBe("completed");
        expect(entry?.response).toEqual(response);
        expect(entry?.completedAt).toBeDefined();
      });

      it("should transition from processing to failed", async () => {
        const key = "test:fail";
        const request = { id: 1 };
        const error = "Permission denied";

        await backend.setProcessing(key, "test_tool", request, 60000);
        let entry = await backend.get(key);
        expect(entry?.state).toBe("processing");

        await backend.recordFailure(key, error);
        entry = await backend.get(key);
        expect(entry?.state).toBe("failed");
        expect(entry?.error).toBe(error);
        expect(entry?.completedAt).toBeDefined();
      });
    });

    describe("Entry Retrieval", () => {
      it("should retrieve stored entries", async () => {
        const key = "test:retrieve";
        const request = { test: "data" };

        await backend.setProcessing(key, "tool1", request, 60000);

        const entry = await backend.get(key);
        expect(entry).toBeDefined();
        expect(entry?.key).toBe(key);
        expect(entry?.toolName).toBe("tool1");
      });

      it("should return undefined for non-existent keys", async () => {
        const entry = await backend.get("non-existent");
        expect(entry).toBeUndefined();
      });

      it("should handle multiple concurrent gets", async () => {
        const key1 = "test:get1";
        const key2 = "test:get2";

        await backend.setProcessing(key1, "tool1", { id: 1 }, 60000);
        await backend.setProcessing(key2, "tool2", { id: 2 }, 60000);

        const [entry1, entry2] = await Promise.all([
          backend.get(key1),
          backend.get(key2),
        ]);

        expect(entry1?.toolName).toBe("tool1");
        expect(entry2?.toolName).toBe("tool2");
      });
    });

    describe("Entry Deletion", () => {
      it("should delete entries", async () => {
        const key = "test:delete";

        await backend.setProcessing(key, "tool1", { id: 1 }, 60000);
        let entry = await backend.get(key);
        expect(entry).toBeDefined();

        await backend.delete(key);
        entry = await backend.get(key);
        expect(entry).toBeUndefined();
      });

      it("should handle deletion of non-existent keys", async () => {
        // Should not throw
        await expect(backend.delete("non-existent")).resolves.not.toThrow();
      });
    });

    describe("Bulk Operations", () => {
      it("should clear all entries", async () => {
        for (let i = 0; i < 5; i++) {
          await backend.setProcessing(`key:${i}`, "tool", { id: i }, 60000);
        }

        let stats = await backend.getStats();
        expect(stats.size).toBe(5);

        await backend.clear();

        stats = await backend.getStats();
        expect(stats.size).toBe(0);
      });
    });

    describe("Statistics", () => {
      it("should track request states", async () => {
        // Processing
        await backend.setProcessing("key:1", "tool", { id: 1 }, 60000);

        // Completed
        await backend.setProcessing("key:2", "tool", { id: 2 }, 60000);
        await backend.recordSuccess("key:2", { ok: true });

        // Failed
        await backend.setProcessing("key:3", "tool", { id: 3 }, 60000);
        await backend.recordFailure("key:3", "error");

        const stats = await backend.getStats();
        expect(stats.processingCount).toBe(1);
        expect(stats.completedCount).toBe(1);
        expect(stats.failedCount).toBe(1);
        expect(stats.size).toBe(3);
      });

      it("should report zero counts when empty", async () => {
        const stats = await backend.getStats();
        expect(stats.size).toBe(0);
        expect(stats.processingCount).toBe(0);
        expect(stats.completedCount).toBe(0);
        expect(stats.failedCount).toBe(0);
      });
    });

    describe("Metadata Handling", () => {
      it("should preserve request metadata", async () => {
        const key = "test:metadata";
        const request = {
          userId: "user123",
          timestamp: 1234567890,
          metadata: { nested: true },
        };

        await backend.setProcessing(key, "tool", request, 60000);

        const entry = await backend.get(key);
        expect(entry?.request).toEqual(request);
      });

      it("should preserve timestamps", async () => {
        const key = "test:timestamps";
        const before = Date.now();

        await backend.setProcessing(key, "tool", { id: 1 }, 60000);

        const after = Date.now();
        const entry = await backend.get(key);

        expect(entry?.createdAt).toBeGreaterThanOrEqual(before);
        expect(entry?.createdAt).toBeLessThanOrEqual(after);
        expect(entry?.expiresAt).toBeGreaterThan(entry?.createdAt!);
      });

      it("should update timestamps on state change", async () => {
        const key = "test:update";

        await backend.setProcessing(key, "tool", { id: 1 }, 60000);
        const initialEntry = await backend.get(key);
        const initialCreatedAt = initialEntry?.createdAt;

        // Wait a bit to ensure time passes
        await new Promise((resolve) => setTimeout(resolve, 10));

        await backend.recordSuccess(key, { ok: true });
        const updatedEntry = await backend.get(key);

        expect(updatedEntry?.createdAt).toBe(initialCreatedAt);
        expect(updatedEntry?.completedAt).toBeDefined();
        expect(updatedEntry?.completedAt).toBeGreaterThan(initialCreatedAt!);
      });
    });

    describe("Complex Scenarios", () => {
      it("should handle rapid state transitions", async () => {
        const key = "test:rapid";

        await backend.setProcessing(key, "tool", { id: 1 }, 60000);
        let entry = await backend.get(key);
        expect(entry?.state).toBe("processing");

        await backend.recordSuccess(key, { ok: true });
        entry = await backend.get(key);
        expect(entry?.state).toBe("completed");

        // Attempting to record failure on completed should be idempotent
        await backend.recordFailure(key, "error");
        entry = await backend.get(key);
        expect(entry?.state).toBe("failed");
      });

      it("should preserve data across multiple operations", async () => {
        const key = "test:preserve";
        const originalRequest = {
          path: "/test.txt",
          content: "hello world",
          nested: { a: 1, b: 2 },
        };

        await backend.setProcessing(key, "fs_write", originalRequest, 60000);

        let entry = await backend.get(key);
        expect(entry?.request).toEqual(originalRequest);
        expect(entry?.response).toBeUndefined();

        const response = { ok: true, written: true };
        await backend.recordSuccess(key, response);

        entry = await backend.get(key);
        expect(entry?.request).toEqual(originalRequest);
        expect(entry?.response).toEqual(response);
      });

      it("should handle concurrent operations on different keys", async () => {
        const operations = [];

        for (let i = 0; i < 10; i++) {
          const key = `key:${i}`;
          const request = { id: i };

          operations.push(
            backend.setProcessing(key, "tool", request, 60000),
          );

          if (i % 2 === 0) {
            operations.push(backend.recordSuccess(key, { ok: true }));
          } else {
            operations.push(backend.recordFailure(key, "error"));
          }
        }

        await Promise.all(operations);

        const stats = await backend.getStats();
        expect(stats.size).toBe(10);
        expect(stats.completedCount).toBe(5);
        expect(stats.failedCount).toBe(5);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty request objects", async () => {
        const key = "test:empty";

        await backend.setProcessing(key, "tool", {}, 60000);

        const entry = await backend.get(key);
        expect(entry?.request).toEqual({});
      });

      it("should handle null responses", async () => {
        const key = "test:null-response";

        await backend.setProcessing(key, "tool", { id: 1 }, 60000);
        await backend.recordSuccess(key, null);

        const entry = await backend.get(key);
        expect(entry?.response).toBeNull();
      });

      it("should handle complex nested structures", async () => {
        const key = "test:complex";
        const complexRequest = {
          nested: {
            deeply: {
              nested: {
                array: [1, 2, 3, { key: "value" }],
              },
            },
          },
        };

        await backend.setProcessing(key, "tool", complexRequest, 60000);

        const entry = await backend.get(key);
        expect(entry?.request).toEqual(complexRequest);
      });

      it("should handle string error messages of any length", async () => {
        const key = "test:long-error";
        const longError =
          "A".repeat(1000) + " Error: " + "B".repeat(1000);

        await backend.setProcessing(key, "tool", { id: 1 }, 60000);
        await backend.recordFailure(key, longError);

        const entry = await backend.get(key);
        expect(entry?.error).toBe(longError);
      });
    });

    describe("TTL Behavior", () => {
      it("should include TTL in expiration timestamp", async () => {
        const key = "test:ttl";
        const ttl = 30000;

        const before = Date.now();
        await backend.setProcessing(key, "tool", { id: 1 }, ttl);
        const after = Date.now();

        const entry = await backend.get(key);
        expect(entry?.expiresAt).toBeGreaterThanOrEqual(before + ttl);
        expect(entry?.expiresAt).toBeLessThanOrEqual(after + ttl);
      });

      it("should preserve TTL across state transitions", async () => {
        const key = "test:ttl-preserve";
        const ttl = 60000;

        const before = Date.now();
        await backend.setProcessing(key, "tool", { id: 1 }, ttl);
        const initialExpiry = (await backend.get(key))?.expiresAt;

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 10));

        await backend.recordSuccess(key, { ok: true });
        const finalExpiry = (await backend.get(key))?.expiresAt;

        // Expiry should be preserved (within a small margin for time passing)
        const difference = Math.abs(initialExpiry! - finalExpiry!);
        expect(difference).toBeLessThan(100); // 100ms margin
      });
    });

    describe("Resource Cleanup", () => {
      it("should cleanup resources on destroy", async () => {
        const backend2 = new InMemoryIdempotencyBackend();
        await backend2.setProcessing("key:1", "tool", { id: 1 }, 60000);

        await backend2.destroy();

        // Stats should be empty after destroy
        const stats = await backend2.getStats();
        expect(stats.size).toBe(0);
      });
    });
  });

  describe("Backend Interface Compliance", () => {
    /**
     * This test verifies that InMemoryIdempotencyBackend correctly implements
     * the IdempotencyBackend interface. Any backend implementation should pass
     * these tests.
     */
    let backend: InMemoryIdempotencyBackend;

    beforeEach(async () => {
      backend = new InMemoryIdempotencyBackend();
    });

    afterEach(async () => {
      await backend.destroy();
    });

    it("should implement all required interface methods", async () => {
      expect(typeof backend.setProcessing).toBe("function");
      expect(typeof backend.get).toBe("function");
      expect(typeof backend.recordSuccess).toBe("function");
      expect(typeof backend.recordFailure).toBe("function");
      expect(typeof backend.delete).toBe("function");
      expect(typeof backend.clear).toBe("function");
      expect(typeof backend.getStats).toBe("function");
      expect(typeof backend.destroy).toBe("function");
    });

    it("should return consistent types", async () => {
      await backend.setProcessing("key:1", "tool", { id: 1 }, 60000);

      const entry = await backend.get("key:1");
      expect(typeof entry?.key).toBe("string");
      expect(typeof entry?.toolName).toBe("string");
      expect(typeof entry?.state).toBe("string");
      expect(typeof entry?.createdAt).toBe("number");
      expect(typeof entry?.expiresAt).toBe("number");

      const stats = await backend.getStats();
      expect(typeof stats.size).toBe("number");
      expect(typeof stats.processingCount).toBe("number");
      expect(typeof stats.completedCount).toBe("number");
      expect(typeof stats.failedCount).toBe("number");
    });

    it("should be async-compatible", async () => {
      const promises = [
        backend.setProcessing("k1", "t1", { id: 1 }, 60000),
        backend.setProcessing("k2", "t2", { id: 2 }, 60000),
        backend.setProcessing("k3", "t3", { id: 3 }, 60000),
      ];

      await Promise.all(promises);

      const stats = await backend.getStats();
      expect(stats.size).toBe(3);
    });
  });
});
