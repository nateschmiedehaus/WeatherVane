import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { WorkerManager } from "../worker/worker_manager.js";

describe("worker entry", () => {
  let manager: WorkerManager;

  beforeEach(() => {
    manager = new WorkerManager();
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  it(
    "responds to health and codex_commands via runTool",
    { timeout: 20_000 },
    async () => {
      await manager.startActive();
      const active = manager.getActive();

      const health = await active.call<{ ok: boolean; version: string }>("health");
      expect(health.ok).toBe(true);
      expect(typeof health.version).toBe("string");

      const response = await active.call<{ content: Array<{ type: string; text: string }> }>(
        "runTool",
        {
          name: "codex_commands",
          input: null,
        },
      );

      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]?.type).toBe("text");
    },
  );

  it(
    "handles plan RPC",
    { timeout: 20_000 },
    async () => {
      await manager.startActive();
      const active = manager.getActive();

      const result = await active.call<{ ok: boolean; tasks: unknown[] }>("plan", {
        limit: 1,
        minimal: true,
      });

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.tasks)).toBe(true);
    },
  );

  it(
    "provides dispatch queue summaries",
    { timeout: 20_000 },
    async () => {
      await manager.startActive();
      const active = manager.getActive();

      const result = await active.call<{
        ok: boolean;
        queue: { total: number };
        operations: unknown;
      }>("dispatch", { limit: 2 });

      expect(result.ok).toBe(true);
      expect(typeof result.queue).toBe("object");
      expect(typeof result.queue.total).toBe("number");
    },
  );

  it(
    "surfaces verification payloads",
    { timeout: 20_000 },
    async () => {
      await manager.startActive();
      const active = manager.getActive();

      const result = await active.call<{
        ok: boolean;
        generated_at: string;
        components: string[];
      }>("verify", {});

      expect(result.ok).toBe(true);
      expect(typeof result.generated_at).toBe("string");
      expect(Array.isArray(result.components)).toBe(true);
    },
  );

  it(
    "generates missed opportunity reports",
    { timeout: 20_000 },
    async () => {
      await manager.startActive();
      const active = manager.getActive();

      const result = await active.call<{
        ok: boolean;
        insights: string[];
      }>("report.mo", { limit: 3 });

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.insights)).toBe(true);
      expect(result.insights.length).toBeGreaterThan(0);
    },
  );
});
