/**
 * Tests for Provider Manager with Failover and Recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProviderManager } from "./provider_manager.js";
import { ProviderCapacityMonitor } from "./provider_capacity_monitor.js";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

describe("ProviderManager", () => {
  let testWorkspace: string;
  let capacityMonitor: ProviderCapacityMonitor;
  let providerManager: ProviderManager;

  beforeEach(async () => {
    testWorkspace = await mkdtemp(path.join(tmpdir(), "wvo-test-"));

    capacityMonitor = new ProviderCapacityMonitor({
      workspaceRoot: testWorkspace,
      probeIntervalSeconds: 1,
    });
    await capacityMonitor.start();

    providerManager = new ProviderManager("codex", capacityMonitor);
  });

  afterEach(async () => {
    capacityMonitor.stop();
    await rm(testWorkspace, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("should initialize with preferred provider", () => {
      const status = providerManager.getStatus();
      expect(status.currentProvider).toBe("codex");
    });

    it("should remember preferred provider", () => {
      expect(providerManager.getPreferredProvider()).toBe("codex");
    });

    it("should support changing preferred provider", () => {
      providerManager.setPreferredProvider("claude_code");
      expect(providerManager.getPreferredProvider()).toBe("claude_code");
    });
  });

  describe("capacity checking", () => {
    it("should report capacity when under limit", async () => {
      const hasCapacity = await providerManager.hasCapacity("codex", 1000);
      expect(hasCapacity).toBe(true);
    });

    it("should report no capacity when over limit", async () => {
      // Use up almost all capacity
      await providerManager.trackUsage("codex", 99000, true);

      const hasCapacity = await providerManager.hasCapacity("codex", 5000);
      expect(hasCapacity).toBe(false);
    });

    it("should report limit hit to capacity monitor", async () => {
      const limitListener = vi.fn();
      capacityMonitor.on("provider:limit", limitListener);

      await providerManager.trackUsage("codex", 99000, true);
      await providerManager.hasCapacity("codex", 5000);

      expect(limitListener).toHaveBeenCalled();
    });
  });

  describe("usage tracking", () => {
    it("should track token usage", async () => {
      await providerManager.trackUsage("codex", 1000, true);

      const status = providerManager.getStatus();
      const codexProvider = status.providers.find((p) => p.provider === "codex");

      expect(codexProvider?.tokensUsed).toBe(1000);
      expect(codexProvider?.requestCount).toBe(1);
    });

    it("should report success to capacity monitor", async () => {
      const successSpy = vi.spyOn(capacityMonitor, "reportSuccess");

      await providerManager.trackUsage("codex", 500, true);

      expect(successSpy).toHaveBeenCalledWith("codex");
    });

    it("should reset usage after an hour", async () => {
      await providerManager.trackUsage("codex", 1000, true);

      // Manually set last reset to over an hour ago
      const status = providerManager.getStatus();
      const usage = (providerManager as any).usage.get("codex");
      if (usage) {
        usage.lastReset = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      }

      await providerManager.trackUsage("codex", 500, true);

      const newStatus = providerManager.getStatus();
      const codexProvider = newStatus.providers.find((p) => p.provider === "codex");

      // Should be reset to just the new usage
      expect(codexProvider?.tokensUsed).toBe(500);
    });
  });

  describe("automatic failover", () => {
    it("should failover to available provider when primary exhausted", async () => {
      const failoverListener = vi.fn();
      providerManager.on("provider:failover", failoverListener);

      // Exhaust codex
      await providerManager.trackUsage("codex", 99500, true);

      // Request provider for task - should failover
      const provider = await providerManager.getBestProvider("cmd_run", 1000);

      expect(provider).toBe("claude_code");
      expect(failoverListener).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "codex",
          to: "claude_code",
          reason: expect.stringContaining("Failover"),
        })
      );
    });

    it("should prioritize task-preferred provider", async () => {
      // Add a task type that prefers claude_code
      (providerManager as any).taskTypes.set("special_task", {
        name: "special_task",
        complexity: "complex",
        preferredProvider: "claude_code",
      });

      const provider = await providerManager.getBestProvider("special_task", 1000);

      expect(provider).toBe("claude_code");
    });

    it("should try all providers before giving up", async () => {
      // Exhaust both providers
      await providerManager.trackUsage("codex", 99500, true);
      await providerManager.trackUsage("claude_code", 149500, true);

      const exhaustedListener = vi.fn();
      providerManager.on("all-providers-exhausted", exhaustedListener);

      const provider = await providerManager.getBestProvider("cmd_run", 1000);

      // Should still return a provider (with most remaining capacity)
      expect(provider).toBeTruthy();
      expect(exhaustedListener).toHaveBeenCalled();
    });
  });

  describe("automatic recovery", () => {
    it("should switch back to preferred provider on recovery", async () => {
      // Exhaust preferred provider
      await providerManager.trackUsage("codex", 99500, true);

      // Failover to secondary
      await providerManager.getBestProvider("cmd_run", 1000);
      expect(providerManager.getStatus().currentProvider).toBe("claude_code");

      // Simulate recovery
      await capacityMonitor.reportLimitHit("codex", 0, 1);
      await capacityMonitor.reportSuccess("codex");

      // Should switch back to preferred
      await new Promise((resolve) => setTimeout(resolve, 100)); // Give event time to propagate

      const provider = await providerManager.getBestProvider("cmd_run", 100);
      expect(provider).toBe("codex");
    });

    it("should emit failover event on recovery switch", async () => {
      const failoverListener = vi.fn();
      providerManager.on("provider:failover", failoverListener);

      // Exhaust and failover
      await providerManager.trackUsage("codex", 99500, true);
      await providerManager.getBestProvider("cmd_run", 1000);

      // Clear previous calls
      failoverListener.mockClear();

      // Recover
      await capacityMonitor.reportLimitHit("codex", 0, 1);
      await capacityMonitor.reportSuccess("codex");

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should emit failover event for recovery
      expect(failoverListener).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "codex",
          reason: expect.stringContaining("Recovered"),
        })
      );
    });
  });

  describe("provider recommendation", () => {
    it("should provide recommendation with reasoning", async () => {
      const recommendation = await providerManager.getProviderRecommendation("critics_run");

      expect(recommendation).toHaveProperty("provider");
      expect(recommendation).toHaveProperty("reasoning");
      expect(recommendation.reasoning).toContain("complex");
    });

    it("should include capacity info in reasoning", async () => {
      const recommendation = await providerManager.getProviderRecommendation("plan_next");

      expect(recommendation.reasoning).toMatch(/remaining.*tokens/i);
    });
  });

  describe("manual provider switching", () => {
    it("should switch provider manually", () => {
      providerManager.switchProvider("claude_code", "manual test");

      expect(providerManager.getStatus().currentProvider).toBe("claude_code");
    });

    it("should emit failover event on manual switch", () => {
      const failoverListener = vi.fn();
      providerManager.on("provider:failover", failoverListener);

      providerManager.switchProvider("claude_code", "manual test");

      expect(failoverListener).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "codex",
          to: "claude_code",
          reason: "manual test",
        })
      );
    });
  });

  describe("integration with capacity monitor", () => {
    it("should respect capacity monitor status", async () => {
      // Tell capacity monitor that codex is down
      await capacityMonitor.reportLimitHit("codex", 0, 60);

      const hasCapacity = await providerManager.hasCapacity("codex", 100);

      // Even if token limits say yes, capacity monitor says no
      expect(hasCapacity).toBe(false);
    });

    it("should handle capacity monitor recovery events", async () => {
      // Hit limit
      await capacityMonitor.reportLimitHit("codex", 0, 1);

      // Verify no capacity
      expect(await providerManager.hasCapacity("codex", 100)).toBe(false);

      // Report recovery
      await capacityMonitor.reportSuccess("codex");

      // Should have capacity again
      expect(await providerManager.hasCapacity("codex", 100)).toBe(true);
    });
  });
});
