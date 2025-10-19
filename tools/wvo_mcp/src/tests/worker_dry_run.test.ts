import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkerManager } from "../worker/worker_manager.js";

describe("worker dry-run safeguards", () => {
  let manager: WorkerManager;

  beforeEach(() => {
    manager = new WorkerManager();
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  it(
    "blocks mutating tools while allowing read operations",
    { timeout: 20_000 },
    async () => {
      await manager.startCanary();
      const canary = manager.getCanary();
      expect(canary).not.toBeNull();

      // Health endpoint should reflect dry-run flag
      const health = await canary!.call<{
        ok: boolean;
        dryRun: boolean;
        flags: { dryRun: boolean };
      }>("health");
      expect(health.ok).toBe(true);
      expect(health.dryRun).toBe(true);
      expect(health.flags.dryRun).toBe(true);

      // Read-only planner calls should succeed
      const planResult = await canary!.call<{ ok: boolean; tasks: unknown[] }>("plan", {
        limit: 1,
      });
      expect(planResult.ok).toBe(true);

      // Mutating tools must be rejected with a DryRunViolation
      await expect(
        canary!.call("runTool", {
          name: "context_write",
          input: { section: "dry-run-test", content: "should-not-write" },
        }),
      ).rejects.toThrow(/dry-run/i);

      await expect(
        canary!.call("runTool", {
          name: "fs_write",
          input: { path: "state/dry_run.txt", content: "forbidden" },
        }),
      ).rejects.toThrow(/dry-run/i);
    },
  );
});
