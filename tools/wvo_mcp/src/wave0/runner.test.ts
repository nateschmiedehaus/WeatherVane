import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { resolveLockStatus } from "./runner";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createLock(contents: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wave0-lock-"));
  tmpDirs.push(dir);
  const lockPath = path.join(dir, ".wave0.lock");
  fs.writeFileSync(lockPath, JSON.stringify(contents, null, 2), "utf-8");
  return lockPath;
}

describe("resolveLockStatus", () => {
  it("returns unlocked when no lock exists", () => {
    const lockPath = path.join(os.tmpdir(), "wave0-no-lock", ".wave0.lock");
    const status = resolveLockStatus(lockPath, 1_000);
    expect(status.locked).toBe(false);
    expect(status.stale).toBeUndefined();
  });

  it("treats dead PID as stale", () => {
    const lockPath = createLock({
      pid: 999999, // assume not running
      startTime: new Date().toISOString(),
    });
    const status = resolveLockStatus(lockPath, 30 * 60 * 1000);
    expect(status.stale).toBe(true);
    expect(status.locked).toBe(false);
    expect(status.reason).toBe("pid_not_running");
  });

  it("treats expired TTL as stale even if PID present", () => {
    const lockPath = createLock({
      pid: process.pid,
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    });
    const status = resolveLockStatus(lockPath, 1 * 60 * 60 * 1000); // 1h TTL
    expect(status.stale).toBe(true);
    expect(status.locked).toBe(false);
    expect(status.reason).toBe("lock_ttl_expired");
  });

  it("treats live PID and fresh lock as active", () => {
    const lockPath = createLock({
      pid: process.pid,
      startTime: new Date().toISOString(),
    });
    const status = resolveLockStatus(lockPath, 60 * 60 * 1000);
    expect(status.locked).toBe(true);
    expect(status.stale).toBe(false);
    expect(status.reason).toBe("active");
  });
});
