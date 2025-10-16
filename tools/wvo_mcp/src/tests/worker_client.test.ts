import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkerClient, isWorkerErrorPayload } from "../worker/worker_client.js";
import type { WorkerManager } from "../worker/worker_manager.js";

vi.mock("../telemetry/logger.js", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}));

describe("WorkerClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns worker result when call succeeds", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    const manager = {
      getActive: () => ({ call }),
    } as unknown as WorkerManager;

    const client = new WorkerClient(manager);
    const result = await client.call("health");

    expect(result).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith("health", undefined, undefined);
  });

  it("returns error payload when worker call throws", async () => {
    const error = new Error("boom");
    (error as { code?: string }).code = "MOCK";
    (error as { details?: unknown }).details = { foo: "bar" };

    const call = vi.fn().mockRejectedValue(error);
    const manager = {
      getActive: () => ({ call }),
    } as unknown as WorkerManager;

    const client = new WorkerClient(manager);
    const result = await client.call("health");

    expect(isWorkerErrorPayload(result)).toBe(true);
    if (isWorkerErrorPayload(result)) {
      expect(result.error).toBe("boom");
      expect(result.code).toBe("MOCK");
      expect(result.details).toEqual({ foo: "bar" });
      expect(result.method).toBe("health");
    }
  });

  it("annotates tool failures with tool name", async () => {
    const error = new Error("tool failure");
    const call = vi.fn().mockRejectedValue(error);
    const manager = {
      getActive: () => ({ call }),
    } as unknown as WorkerManager;

    const client = new WorkerClient(manager);
    const result = await client.callTool("plan_next", { limit: 1 });

    expect(call).toHaveBeenCalledWith(
      "runTool",
      { name: "plan_next", input: { limit: 1 } },
      undefined,
    );
    expect(isWorkerErrorPayload(result)).toBe(true);
    if (isWorkerErrorPayload(result)) {
      expect(result.method).toBe("runTool:plan_next");
      expect(result.error).toBe("tool failure");
    }
  });

  it("forwards call options to the underlying worker", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    const manager = {
      getActive: () => ({ call }),
    } as unknown as WorkerManager;

    const client = new WorkerClient(manager);
    const timeoutMs = 120_000;
    await client.callTool("critics_run", undefined, { timeoutMs });

    expect(call).toHaveBeenCalledWith(
      "runTool",
      { name: "critics_run", input: undefined },
      { timeoutMs },
    );
  });
});
