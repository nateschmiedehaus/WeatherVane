import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerManager } from '../worker/worker_manager.js';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_WORKER_PATH = path.resolve(THIS_DIR, 'helpers', 'mock_worker.ts');

describe('WorkerManager', () => {
  let manager: WorkerManager;

  beforeEach(() => {
    manager = new WorkerManager();
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  it('starts active worker and handles basic RPC', async () => {
    await manager.startActive({
      entryPath: MOCK_WORKER_PATH,
      env: { MOCK_WORKER_VERSION: 'v1' },
    });
    const result = await manager.getActive().call<{ version: string }>('getVersion');
    expect(result.version).toBe('v1');
  });

  it('performs zero-downtime switch from active to canary', async () => {
    await manager.startActive({
      entryPath: MOCK_WORKER_PATH,
      env: { MOCK_WORKER_VERSION: 'v1' },
    });
    const baseline = await manager.getActive().call<{ version: string }>('getVersion');
    expect(baseline.version).toBe('v1');

    await manager.startCanary({
      entryPath: MOCK_WORKER_PATH,
      env: { MOCK_WORKER_VERSION: 'v2' },
    });

    // Active worker continues serving requests while canary warms up
    const duringCanaryWarmup = await manager.getActive().call<{ version: string }>('getVersion');
    expect(duringCanaryWarmup.version).toBe('v1');

    const summary = await manager.switchToCanary();
    expect(summary.promotedWorkerPid).toBeGreaterThan(0);

    const afterSwitch = await manager.getActive().call<{ version: string }>('getVersion');
    expect(afterSwitch.version).toBe('v2');
  });

  it('propagates worker-side errors', async () => {
    await manager.startActive({
      entryPath: MOCK_WORKER_PATH,
    });

    await expect(manager.getActive().call('fail')).rejects.toThrow('intentional failure');
  });

  it('forces active workers out of dry-run mode even when inherited', async () => {
    const original = process.env.WVO_DRY_RUN;
    process.env.WVO_DRY_RUN = '1';

    try {
      await manager.startActive({
        entryPath: MOCK_WORKER_PATH,
      });
      const response = await manager
        .getActive()
        .call<{ name: string; value: string | null }>('getEnvVar', { name: 'WVO_DRY_RUN' });
      expect(response.value).toBe('0');
    } finally {
      if (original === undefined) {
        delete process.env.WVO_DRY_RUN;
      } else {
        process.env.WVO_DRY_RUN = original;
      }
    }
  });

  it('launches canary workers in dry-run mode by default and allows overrides', async () => {
    await manager.startCanary({
      entryPath: MOCK_WORKER_PATH,
    });
    const defaultCanary = manager.getCanary();
    expect(defaultCanary).not.toBeNull();
    const defaultResponse = await defaultCanary!.call<{ name: string; value: string | null }>(
      'getEnvVar',
      { name: 'WVO_DRY_RUN' },
    );
    expect(defaultResponse.value).toBe('1');

    await manager.stopAll();

    await manager.startCanary({
      entryPath: MOCK_WORKER_PATH,
      env: { WVO_DRY_RUN: '0' },
    });
    const overriddenCanary = manager.getCanary();
    expect(overriddenCanary).not.toBeNull();
    const overriddenResponse = await overriddenCanary!.call<{ name: string; value: string | null }>(
      'getEnvVar',
      { name: 'WVO_DRY_RUN' },
    );
    expect(overriddenResponse.value).toBe('0');
  });

  it('captures health snapshot and persists telemetry when configured', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'worker-manager-'));
    const snapshotPath = path.join(tmpDir, 'worker_snapshot.json');
    const telemetryManager = new WorkerManager({ snapshotPath });

    try {
      await telemetryManager.startActive({
        entryPath: MOCK_WORKER_PATH,
        env: { MOCK_WORKER_VERSION: 'v3' },
      });

      const snapshot = await telemetryManager.getSnapshot();
      expect(snapshot.active).not.toBeNull();
      expect(snapshot.active?.last_health?.ok).toBe(true);
      expect(snapshot.persisted_path).toBe(snapshotPath);

      const persisted = JSON.parse(await readFile(snapshotPath, 'utf8'));
      expect(persisted.active.label).toBe('active');
      expect(persisted.active.last_health.ok).toBe(true);
    } finally {
      await telemetryManager.stopAll();
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
