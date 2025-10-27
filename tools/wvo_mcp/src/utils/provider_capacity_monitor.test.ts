/**
 * Tests for Provider Capacity Monitor
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { ProviderCapacityMonitor } from "./provider_capacity_monitor.js";

describe("ProviderCapacityMonitor", () => {
  let testWorkspace: string;
  let monitor: ProviderCapacityMonitor;

  beforeEach(async () => {
    // Create temp workspace
    testWorkspace = await mkdtemp(path.join(tmpdir(), "wvo-test-"));

    monitor = new ProviderCapacityMonitor({
      workspaceRoot: testWorkspace,
      probeIntervalSeconds: 1, // Fast probing for tests
      maxProbeInterval: 5,
    });
  });

  afterEach(async () => {
    monitor.stop();
    await rm(testWorkspace, { recursive: true, force: true });
  });

  describe("start and stop", () => {
    it("should start monitoring without errors", async () => {
      await expect(monitor.start()).resolves.not.toThrow();
    });

    it("should stop monitoring cleanly", async () => {
      await monitor.start();
      expect(() => monitor.stop()).not.toThrow();
    });

    it("should not crash if stopped without starting", () => {
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  describe("limit detection and reporting", () => {
    it("should report provider limit hit", async () => {
      await monitor.start();

      const limitListener = vi.fn();
      monitor.on("provider:limit", limitListener);

      await monitor.reportLimitHit("codex", 100, 30);

      expect(limitListener).toHaveBeenCalledWith({
        provider: "codex",
        tokensRemaining: 100,
        estimatedRecoveryMinutes: 30,
      });
    });

    it("should track limit hit in status", async () => {
      await monitor.start();
      await monitor.reportLimitHit("codex", 0, 60);

      const status = monitor.getProviderStatus("codex");
      expect(status).toBeDefined();
      expect(status?.hasCapacity).toBe(false);
      expect(status?.consecutiveFailures).toBe(1);
    });

    it("should track multiple consecutive limit hits", async () => {
      await monitor.start();

      await monitor.reportLimitHit("codex", 0, 60);
      await monitor.reportLimitHit("codex", 0, 60);
      await monitor.reportLimitHit("codex", 0, 60);

      const status = monitor.getProviderStatus("codex");
      expect(status?.consecutiveFailures).toBe(3);
    });
  });

  describe("recovery detection", () => {
    it("should report provider recovery", async () => {
      await monitor.start();

      const recoveryListener = vi.fn();
      monitor.on("provider:recovered", recoveryListener);

      // First hit limit
      await monitor.reportLimitHit("codex", 0, 1);

      // Then recover
      await monitor.reportSuccess("codex");

      expect(recoveryListener).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "codex",
          wasDownForMs: expect.any(Number),
        })
      );
    });

    it("should track recovery in status", async () => {
      await monitor.start();

      await monitor.reportLimitHit("codex", 0, 1);
      await monitor.reportSuccess("codex");

      const status = monitor.getProviderStatus("codex");
      expect(status?.hasCapacity).toBe(true);
      expect(status?.consecutiveSuccesses).toBe(1);
      expect(status?.consecutiveFailures).toBe(0);
    });

    it("should not emit recovery event if provider was never down", async () => {
      await monitor.start();

      const recoveryListener = vi.fn();
      monitor.on("provider:recovered", recoveryListener);

      await monitor.reportSuccess("codex");

      expect(recoveryListener).not.toHaveBeenCalled();
    });
  });

  describe("capacity status", () => {
    it("should report unknown provider as having capacity by default", () => {
      expect(monitor.hasCapacity("codex")).toBe(true);
    });

    it("should report no capacity after limit hit", async () => {
      await monitor.start();
      await monitor.reportLimitHit("codex", 0, 60);

      expect(monitor.hasCapacity("codex")).toBe(false);
    });

    it("should report capacity after recovery", async () => {
      await monitor.start();
      await monitor.reportLimitHit("codex", 0, 1);
      await monitor.reportSuccess("codex");

      expect(monitor.hasCapacity("codex")).toBe(true);
    });
  });

  describe("automatic probing", () => {
    it("should start probing after limit hit", async () => {
      await monitor.start();

      const probeListener = vi.fn();
      monitor.on("provider:probe:ready", probeListener);

      await monitor.reportLimitHit("codex", 0, 0); // 0 minute recovery estimate

      // Wait for probe to trigger
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should emit probe:ready when recovery time is reached
      expect(probeListener).toHaveBeenCalled();
    });

    it("should stop probing after recovery", async () => {
      await monitor.start();

      await monitor.reportLimitHit("codex", 0, 60);
      await monitor.reportSuccess("codex");

      // After recovery, no more probes should be scheduled
      const status = monitor.getProviderStatus("codex");
      expect(status?.estimatedRecoveryTime).toBeUndefined();
    });
  });

  describe("history persistence", () => {
    it("should persist capacity history to disk", async () => {
      await monitor.start();

      await monitor.reportLimitHit("codex", 0, 30);
      await monitor.reportSuccess("claude_code");

      // History should be saved to file
      const fs = await import("node:fs");
      const historyPath = path.join(
        testWorkspace,
        "state",
        "analytics",
        "provider_capacity_history.jsonl"
      );

      expect(fs.existsSync(historyPath)).toBe(true);
    });

    it("should load history on start", async () => {
      // First run - create history
      const monitor1 = new ProviderCapacityMonitor({
        workspaceRoot: testWorkspace,
        probeIntervalSeconds: 1,
      });
      await monitor1.start();
      await monitor1.reportLimitHit("codex", 0, 30);
      monitor1.stop();

      // Second run - should load history
      const monitor2 = new ProviderCapacityMonitor({
        workspaceRoot: testWorkspace,
        probeIntervalSeconds: 1,
      });
      await monitor2.start();

      const status = monitor2.getProviderStatus("codex");
      expect(status?.hasCapacity).toBe(false);

      monitor2.stop();
    });
  });

  describe("multiple providers", () => {
    it("should track multiple providers independently", async () => {
      await monitor.start();

      await monitor.reportLimitHit("codex", 0, 30);
      await monitor.reportSuccess("claude_code");

      expect(monitor.hasCapacity("codex")).toBe(false);
      expect(monitor.hasCapacity("claude_code")).toBe(true);
    });

    it("should get status for all providers", async () => {
      await monitor.start();

      await monitor.reportLimitHit("codex", 0, 30);
      await monitor.reportSuccess("claude_code");

      const allStatus = monitor.getStatus();
      expect(allStatus).toHaveLength(2);
      expect(allStatus.find((s) => s.provider === "codex")?.hasCapacity).toBe(false);
      expect(allStatus.find((s) => s.provider === "claude_code")?.hasCapacity).toBe(true);
    });
  });
});
