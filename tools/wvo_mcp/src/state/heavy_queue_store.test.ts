import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HeavyTaskQueueStore } from "./heavy_queue_store.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("HeavyTaskQueueStore", () => {
  it("enqueues and updates tasks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wvo-queue-"));
    tmpDirs.push(root);
    const store = new HeavyTaskQueueStore(root);

    const queued = await store.enqueue({ summary: "Run long integration tests" });
    expect(queued.status).toBe("queued");

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].summary).toMatch(/integration/);

    const updated = await store.updateStatus({ id: queued.id, status: "completed" });
    expect(updated?.status).toBe("completed");
  });
});
