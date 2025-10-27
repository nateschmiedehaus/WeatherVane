import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ResolutionMetricsStore } from '../../orchestrator/resolution_metrics_store.js';

async function waitForTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ResolutionMetricsStore', () => {
  let workspace: string;
  let store: ResolutionMetricsStore;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'resolution-metrics-'));
    store = new ResolutionMetricsStore(workspace);
    await waitForTick();
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('records attempts, incidents, and closures', async () => {
    await store.recordAttempt({
      taskId: 'T-1',
      attempt: 1,
      timestamp: '2025-10-27T00:00:00.000Z',
      runId: 'run-test',
      label: 'missing_dependency',
    });

    await store.recordAttempt({
      taskId: 'T-1',
      attempt: 2,
      timestamp: '2025-10-27T00:05:00.000Z',
      runId: 'run-test',
      label: 'missing_dependency',
    });

    await store.recordIncident({
      taskId: 'T-1',
      state: 'verify',
      attempt: 3,
      timestamp: '2025-10-27T00:06:00.000Z',
    });

    await store.markClosed({
      taskId: 'T-1',
      attempt: 3,
      timestamp: '2025-10-27T00:10:00.000Z',
      runId: 'run-test',
    });

    const snapshotPath = path.join(
      workspace,
      'state',
      'analytics',
      'resolution_metrics.json'
    );
    const content = await readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(content) as {
      stats: {
        totalLoops: number;
        closedLoops: number;
        closedWithin3: number;
        incidentCount: number;
        attemptHistogram: Record<string, number>;
      };
      activeLoops: unknown[];
      recentlyClosed: Array<{ taskId: string; attempts: number }>;
      recentEvents: Array<{ type: string }>;
    };

    expect(snapshot.stats.totalLoops).toBe(1);
    expect(snapshot.stats.closedLoops).toBe(1);
    expect(snapshot.stats.closedWithin3).toBe(1);
    expect(snapshot.stats.incidentCount).toBe(1);
    expect(snapshot.stats.attemptHistogram['1']).toBeDefined();
    expect(snapshot.stats.attemptHistogram['2']).toBeDefined();
    expect(snapshot.activeLoops.length).toBe(0);
    expect(snapshot.recentlyClosed[0]?.taskId).toBe('T-1');
    expect(snapshot.recentEvents.length).toBeGreaterThan(0);
  });

  it('persists active loops between instances', async () => {
    await store.recordAttempt({
      taskId: 'T-2',
      attempt: 1,
      timestamp: '2025-10-27T01:00:00.000Z',
      runId: 'run-alpha',
      label: 'underspecified_requirements',
    });
    await waitForTick();

    const snapshotPath = path.join(
      workspace,
      'state',
      'analytics',
      'resolution_metrics.json'
    );
    const content = await readFile(snapshotPath, 'utf8');
    const parsed = JSON.parse(content) as { activeLoops: Array<{ taskId: string }> };
    expect(parsed.activeLoops.some((loop) => loop.taskId === 'T-2')).toBe(true);

    const reloaded = new ResolutionMetricsStore(workspace);
    await waitForTick();
    await reloaded.markClosed({
      taskId: 'T-2',
      attempt: 1,
      timestamp: '2025-10-27T01:10:00.000Z',
      runId: 'run-alpha',
    });
    await waitForTick();

    const updated = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      activeLoops: Array<{ taskId: string }>;
      stats: { closedLoops: number };
    };

    expect(updated.activeLoops.some((loop) => loop.taskId === 'T-2')).toBe(false);
    expect(updated.stats.closedLoops).toBeGreaterThanOrEqual(1);
  });
});
