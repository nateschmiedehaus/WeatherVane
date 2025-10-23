/**
 * Tests for Resource Budgets & Observability
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ResourceBudgetManager,
  DEFAULT_RESOURCE_BUDGET_CONFIG,
  getResourceBudgetManager,
  resetResourceBudgetManager,
  type ResourceBudgetConfig,
  type WorkerCallContext,
} from "./resource_budgets.js";

describe("ResourceBudgetManager", () => {
  let manager: ResourceBudgetManager;

  beforeEach(() => {
    resetResourceBudgetManager();
    manager = new ResourceBudgetManager();
  });

  afterEach(() => {
    resetResourceBudgetManager();
  });

  describe("initialization", () => {
    it("should create with default config", () => {
      expect(manager).toBeDefined();
      const status = manager.getConcurrencyStatus();
      expect(status.global.limit).toBe(DEFAULT_RESOURCE_BUDGET_CONFIG.globalConcurrencyLimit);
    });

    it("should merge custom config", () => {
      const custom = new ResourceBudgetManager({
        globalConcurrencyLimit: 16,
        maxRssMb: 1024,
      });

      const status = custom.getConcurrencyStatus();
      expect(status.global.limit).toBe(16);
    });

    it("should support lane concurrency limits", () => {
      const status = manager.getConcurrencyStatus();
      expect(status.lanes.tool_call).toBeDefined();
      expect(status.lanes.file_read).toBeDefined();
      expect(status.lanes.file_write).toBeDefined();
    });
  });

  describe("slot acquisition and release", () => {
    it("should acquire a slot for valid request", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call");

      expect(context).toBeDefined();
      expect(context?.taskId).toBe("task-1");
      expect(context?.lane).toBe("tool_call");

      manager.releaseSlot(context!, true);
    });

    it("should reject when global concurrency limit reached", async () => {
      const config: Partial<ResourceBudgetConfig> = {
        globalConcurrencyLimit: 2,
      };
      const limited = new ResourceBudgetManager(config);

      const ctx1 = await limited.acquireSlot("task-1", "tool_call");
      const ctx2 = await limited.acquireSlot("task-2", "tool_call");
      const ctx3 = await limited.acquireSlot("task-3", "tool_call");

      expect(ctx1).toBeDefined();
      expect(ctx2).toBeDefined();
      expect(ctx3).toBeNull();

      limited.releaseSlot(ctx1!, true);
      limited.releaseSlot(ctx2!, true);
    });

    it("should reject when lane capacity exceeded", async () => {
      const config: Partial<ResourceBudgetConfig> = {
        laneConcurrencyLimits: { tool_call: 1 },
      };
      const limited = new ResourceBudgetManager(config);

      const ctx1 = await limited.acquireSlot("task-1", "tool_call");
      const ctx2 = await limited.acquireSlot("task-2", "tool_call");

      expect(ctx1).toBeDefined();
      expect(ctx2).toBeNull();

      limited.releaseSlot(ctx1!, true);
    });

    it("should track multiple lanes independently", async () => {
      const ctx1 = await manager.acquireSlot("task-1", "file_read");
      const ctx2 = await manager.acquireSlot("task-2", "file_write");

      const status = manager.getConcurrencyStatus();
      expect(status.lanes.file_read.active).toBe(1);
      expect(status.lanes.file_write.active).toBe(1);

      manager.releaseSlot(ctx1!, true);
      manager.releaseSlot(ctx2!, true);

      const status2 = manager.getConcurrencyStatus();
      expect(status2.lanes.file_read.active).toBe(0);
      expect(status2.lanes.file_write.active).toBe(0);
    });

    it("should record metrics on release", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call");
      expect(context).toBeDefined();

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.releaseSlot(context!, true);

      const metrics = manager.getMetrics();
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].taskId).toBe("task-1");
      expect(metrics[0].success).toBe(true);
      expect(metrics[0].durationMs).toBeGreaterThan(0);
    });

    it("should record failure metrics", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call");
      const error = new Error("Test error");

      manager.releaseSlot(context!, false, error);

      const metrics = manager.getMetrics();
      expect(metrics[0].success).toBe(false);
      expect(metrics[0].errorType).toBe("Error");
    });
  });

  describe("memory monitoring", () => {
    it("should capture memory snapshot", () => {
      const snapshot = manager.getMemorySnapshot();

      expect(snapshot.rssMb).toBeGreaterThan(0);
      expect(snapshot.heapTotalMb).toBeGreaterThan(0);
      expect(snapshot.heapUsedMb).toBeGreaterThan(0);
      expect(snapshot.timestamp).toBeDefined();
    });

    it("should disable memory guards when configured", async () => {
      const noGuards = new ResourceBudgetManager({
        enableMemoryGuards: false,
        maxRssMb: 1, // Impossibly low
      });

      const context = await noGuards.acquireSlot("task-1", "tool_call");
      expect(context).toBeDefined(); // Should succeed despite memory

      noGuards.releaseSlot(context!, true);
    });
  });

  describe("timeout management", () => {
    it("should support custom timeouts", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call", 5000);
      expect(context?.timeoutMs).toBe(5000);

      manager.releaseSlot(context!, true);
    });

    it("should reject negative timeout values", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call", -1000);
      expect(context).toBeNull();
    });

    it("should use default timeout if not specified", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call");
      expect(context?.timeoutMs).toBe(DEFAULT_RESOURCE_BUDGET_CONFIG.defaultTimeoutMs);

      manager.releaseSlot(context!, true);
    });
  });

  describe("metrics and statistics", () => {
    it("should provide accurate statistics", async () => {
      // Acquire and release multiple contexts
      const ctx1 = await manager.acquireSlot("task-1", "tool_call");
      manager.releaseSlot(ctx1!, true);

      const ctx2 = await manager.acquireSlot("task-2", "tool_call");
      manager.releaseSlot(ctx2!, false, new Error("Intentional failure"));

      const ctx3 = await manager.acquireSlot("task-3", "tool_call");
      manager.releaseSlot(ctx3!, true);

      const stats = manager.getStatistics();
      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.averageDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should limit metrics size to prevent memory bloat", async () => {
      const config: Partial<ResourceBudgetConfig> = {
        globalConcurrencyLimit: 1000, // High to allow many concurrent
      };
      const unlimited = new ResourceBudgetManager(config);

      // Create many metrics entries (up to default max)
      for (let i = 0; i < 1100; i++) {
        const ctx = await unlimited.acquireSlot(`task-${i}`, "tool_call");
        if (ctx) {
          unlimited.releaseSlot(ctx, true);
        }
      }

      const metrics = unlimited.getMetrics();
      expect(metrics.length).toBeLessThanOrEqual(1000);
    });

    it("should allow metrics clearing", async () => {
      const ctx = await manager.acquireSlot("task-1", "tool_call");
      manager.releaseSlot(ctx!, true);

      let metrics = manager.getMetrics();
      expect(metrics.length).toBeGreaterThan(0);

      manager.clearMetrics();
      metrics = manager.getMetrics();
      expect(metrics.length).toBe(0);
    });
  });

  describe("concurrency status", () => {
    it("should report accurate concurrency status", async () => {
      const ctx1 = await manager.acquireSlot("task-1", "tool_call");
      const ctx2 = await manager.acquireSlot("task-2", "file_read");

      const status = manager.getConcurrencyStatus();
      expect(status.global.active).toBe(2);
      expect(status.lanes.tool_call.active).toBe(1);
      expect(status.lanes.file_read.active).toBe(1);

      manager.releaseSlot(ctx1!, true);
      manager.releaseSlot(ctx2!, true);

      const status2 = manager.getConcurrencyStatus();
      expect(status2.global.active).toBe(0);
    });
  });

  describe("metadata tracking", () => {
    it("should accept and track custom metadata", async () => {
      const metadata = { userId: "user-123", region: "us-east-1" };
      const context = await manager.acquireSlot("task-1", "tool_call", undefined, metadata);

      expect(context?.metadata).toEqual(metadata);

      manager.releaseSlot(context!, true);
    });
  });

  describe("singleton pattern", () => {
    it("should provide global instance", () => {
      resetResourceBudgetManager();

      const mgr1 = getResourceBudgetManager();
      const mgr2 = getResourceBudgetManager();

      expect(mgr1).toBe(mgr2);
    });

    it("should allow custom config on first call", () => {
      resetResourceBudgetManager();

      const mgr = getResourceBudgetManager({ globalConcurrencyLimit: 64 });
      const status = mgr.getConcurrencyStatus();

      expect(status.global.limit).toBe(64);
    });
  });

  describe("error handling", () => {
    it("should handle errors during release gracefully", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call");
      const testError = new TypeError("Invalid type");

      // Should not throw
      expect(() => {
        manager.releaseSlot(context!, false, testError);
      }).not.toThrow();

      const metrics = manager.getMetrics();
      expect(metrics[0].errorType).toBe("TypeError");
    });

    it("should cleanup resources on error", async () => {
      const context = await manager.acquireSlot("task-1", "tool_call");
      const testError = new Error("Test error");

      manager.releaseSlot(context!, false, testError);
      const status = manager.getConcurrencyStatus();

      expect(status.global.active).toBe(0);
      expect(status.lanes.tool_call.active).toBe(0);
    });
  });

  describe("OTel span integration", () => {
    it("should support span emission when enabled", async () => {
      const config: Partial<ResourceBudgetConfig> = {
        enableSpanEmission: true,
        spanSampleRate: 1.0, // Always emit
      };
      const withSpans = new ResourceBudgetManager(config);

      const context = await withSpans.acquireSlot("task-1", "tool_call");
      // Spans are created, we can't directly test them but verify no errors
      expect(context).toBeDefined();

      withSpans.releaseSlot(context!, true);
    });

    it("should respect sampling rate", async () => {
      const config: Partial<ResourceBudgetConfig> = {
        enableSpanEmission: true,
        spanSampleRate: 0.0, // Never emit
      };
      const sampled = new ResourceBudgetManager(config);

      const context = await sampled.acquireSlot("task-1", "tool_call");
      expect(context?.span).toBeNull();

      sampled.releaseSlot(context!, true);
    });
  });
});
