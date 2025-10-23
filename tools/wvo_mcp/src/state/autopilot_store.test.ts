import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AutopilotStore } from "./autopilot_store.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("AutopilotStore", () => {
  vi.setConfig({ testTimeout: 20000 });
  it("records audits and maintains history", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "wvo-autopilot-"));
    tmpDirs.push(root);
    const store = new AutopilotStore(root);

    const initial = await store.read();
    expect(initial.last_audit).toBeNull();
    expect(initial.audit_history).toEqual([]);

    await store.recordAudit({ task_id: "T1", focus: "qa" });
    const afterFirst = await store.read();
    expect(afterFirst.last_audit?.task_id).toBe("T1");
    expect(afterFirst.audit_history.length).toBe(1);

    for (let i = 0; i < 60; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.recordAudit({ task_id: `T${i}`, focus: "regression" });
    }
    const afterMany = await store.read();
    expect(afterMany.audit_history.length).toBeLessThanOrEqual(50);
    expect(afterMany.audit_count).toBeGreaterThan(50);
  });
});
