import fs from "node:fs";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

type WorkerRole = "orchestrator" | "executor";

interface WorkerOptions {
  role: WorkerRole;
  dryRun: boolean;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

interface WorkerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { message: string; stack?: string };
}

class WorkerTestHarness {
  private readonly child: ChildProcess;
  private readonly pendingCalls = new Map<string, PendingCall>();
  private readonly readyPromise: Promise<void>;
  private readyResolved = false;
  private readonly callTimeoutMs: number;

  constructor(options: WorkerOptions) {
    const { entryPath, execArgv } = resolveWorkerEntry();
    this.callTimeoutMs = options.timeoutMs ?? 15000;
    this.child = fork(entryPath, [], {
      env: {
        ...process.env,
        WVO_WORKER_ROLE: options.role,
        WVO_DRY_RUN: options.dryRun ? "1" : "0",
        ...options.env,
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execArgv,
    });

    this.child.on("message", (raw: unknown) => {
      this.handleMessage(raw);
    });

    this.child.on("error", (error) => {
      this.rejectAllPending(error);
    });

    this.child.on("exit", (code, signal) => {
      if (!this.readyResolved) {
        this.rejectAllPending(
          new Error(
            `Worker exited before ready (code=${code ?? "null"}, signal=${signal ?? "null"})`,
          ),
        );
      } else {
        this.rejectAllPending(
          new Error(`Worker exited (code=${code ?? "null"}, signal=${signal ?? "null"})`),
        );
      }
    });

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.readyResolved) {
          reject(new Error("Timed out waiting for worker ready signal"));
        }
      }, this.callTimeoutMs);

      const handleReady = (raw: unknown) => {
        const message = raw as Record<string, unknown> | null;
        if (message?.type === "ready") {
          this.readyResolved = true;
          cleanup();
          resolve();
        }
      };

      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const handleExit = () => {
        if (!this.readyResolved) {
          cleanup();
          reject(new Error("Worker exited before signalling ready"));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.child.off("message", handleReady);
        this.child.off("error", handleError);
        this.child.off("exit", handleExit);
      };

      this.child.on("message", handleReady);
      this.child.once("error", handleError);
      this.child.once("exit", handleExit);
    });
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  async call<R = unknown>(method: string, params?: unknown): Promise<R> {
    await this.ready();
    const id = randomUUID();
    const payload = { id, method, params };

    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          reject(new Error(`Worker call timed out after ${this.callTimeoutMs}ms (${method})`));
        }
      }, this.callTimeoutMs);

      this.pendingCalls.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as R);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });

      this.child.send(payload);
    });
  }

  async dispose(): Promise<void> {
    this.rejectAllPending(new Error("Worker disposed"));
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.child.kill("SIGKILL");
          resolve();
        }, 2000);
        this.child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }

  private handleMessage(raw: unknown) {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const message = raw as WorkerResponse & { type?: string };

    if ("type" in message && message.type === "ready") {
      return;
    }

    if (!message.id || typeof message.id !== "string") {
      return;
    }

    const pending = this.pendingCalls.get(message.id);
    if (!pending) {
      return;
    }

    this.pendingCalls.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result ?? null);
    } else {
      const errorMessage = message.error?.message ?? "Unknown worker error";
      const error = new Error(errorMessage);
      if (message.error?.stack) {
        error.stack = message.error.stack;
      }
      pending.reject(error);
    }
  }

  private rejectAllPending(error: Error) {
    for (const [id, pending] of this.pendingCalls.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingCalls.delete(id);
    }
  }
}

function resolveWorkerEntry(): { entryPath: string; execArgv: string[] } {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(testDir, "..");
  const projectRoot = path.resolve(srcRoot, "..");
  const distEntry = path.resolve(projectRoot, "dist", "worker", "worker_entry.js");
  if (fs.existsSync(distEntry)) {
    return { entryPath: distEntry, execArgv: [] };
  }
  const srcEntry = path.resolve(srcRoot, "worker", "worker_entry.ts");
  if (fs.existsSync(srcEntry)) {
    return { entryPath: srcEntry, execArgv: ["--loader", "ts-node/esm"] };
  }
  throw new Error("Unable to locate worker entry point for tests");
}

function parseJsonResponse(result: unknown): unknown {
  const record = result as { content?: Array<{ type: string; text?: string }> };
  const item = record.content?.[0];
  if (!item || item.type !== "text" || typeof item.text !== "string") {
    throw new Error("Unexpected tool response format");
  }
  return JSON.parse(item.text);
}

describe("worker_entry orchestrator role", () => {
  let worker: WorkerTestHarness | null = null;

  afterEach(async () => {
    if (worker) {
      await worker.dispose();
      worker = null;
    }
  });

  it(
    "flags dry-run mode in health payload",
    { timeout: 20_000 },
    async () => {
      worker = new WorkerTestHarness({ role: "orchestrator", dryRun: true });
      const health = await worker.call<{
        ok: boolean;
        dryRun: boolean;
        flags?: Record<string, unknown>;
      }>("health");

      expect(health.ok).toBe(true);
      expect(health.dryRun).toBe(true);
      expect(health.flags).toMatchObject({ dryRun: true });
    },
  );

  it(
    "allows read-only tools when DRY_RUN=1",
    { timeout: 20_000 },
    async () => {
      worker = new WorkerTestHarness({ role: "orchestrator", dryRun: true });
      const readResult = await worker.call("runTool", {
        name: "fs_read",
        input: { path: "package.json" },
      });

      const parsed = parseJsonResponse(readResult) as { path: string; content: string };
      expect(parsed.path).toBe("package.json");
      expect(typeof parsed.content).toBe("string");
      expect(parsed.content.length).toBeGreaterThan(0);
    },
  );

  it(
    "rejects mutating tools when DRY_RUN=1",
    { timeout: 20_000 },
    async () => {
      worker = new WorkerTestHarness({ role: "orchestrator", dryRun: true });
      await expect(
        worker.call("runTool", {
          name: "plan_update",
          input: { task_id: "TASK-123", status: "done" },
        }),
      ).rejects.toThrow(/Dry-run mode forbids tool:plan_update/i);

      await expect(
        worker.call("runTool", {
          name: "context_write",
          input: { section: "tests", content: "dry-run guard should block", append: false },
        }),
      ).rejects.toThrow(/Dry-run mode forbids tool:context_write/i);
    },
  );

  it(
    "keeps legacy behaviour when DRY_RUN=0",
    { timeout: 20_000 },
    async () => {
      worker = new WorkerTestHarness({ role: "orchestrator", dryRun: false });
      const result = await worker.call("runTool", {
        name: "plan_update",
        input: { task_id: "TASK-123", status: "done" },
      });

      const parsed = parseJsonResponse(result) as { ok?: boolean; error?: string };
      expect(parsed.ok).toBe(true);
      expect(parsed.error).toBeUndefined();
    },
  );
});

describe("worker_entry executor role", () => {
  let worker: WorkerTestHarness | null = null;

  afterEach(async () => {
    if (worker) {
      await worker.dispose();
      worker = null;
    }
  });

  it(
    "allows fs_read but not mutating tools in DRY_RUN=1",
    { timeout: 20_000 },
    async () => {
      worker = new WorkerTestHarness({ role: "executor", dryRun: true });

      const readResult = await worker.call("runTool", {
        name: "fs_read",
        input: { path: "package.json" },
      });
      const parsed = parseJsonResponse(readResult) as { path: string; content: string };
      expect(parsed.path).toBe("package.json");
      expect(typeof parsed.content).toBe("string");

      await expect(
        worker.call("runTool", {
          name: "cmd_run",
          input: { cmd: "echo forbidden" },
        }),
      ).rejects.toThrow(/Dry-run mode forbids tool:cmd_run/i);
    },
  );

  it(
    "executes mutating tools when DRY_RUN=0",
    { timeout: 20_000 },
    async () => {
      worker = new WorkerTestHarness({ role: "executor", dryRun: false });
      const result = await worker.call("runTool", {
        name: "cmd_run",
        input: { cmd: "echo worker-live" },
      });

      const parsed = parseJsonResponse(result) as { stdout: string; code: number };
      expect(parsed.code).toBe(0);
      expect(parsed.stdout).toContain("worker-live");
    },
  );
});
