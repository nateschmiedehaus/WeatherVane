import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { ObservabilityMetricsLoader } from '../metrics_loader.js';
import { ObservabilityMetricsProvider } from '../metrics_provider.js';
import { ObservabilityServer } from '../observability_server.js';

async function writeJson(target: string, relative: string, data: unknown) {
  const filePath = path.join(target, relative);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

describe('Observability metrics pipeline', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'observability-test-'));
    await writeJson(workspace, 'state/analytics/autopilot_health_report.json', {
      running: true,
      metricsHistory: [
        {
          timestamp: 1000,
          pendingCount: 2,
          readyCount: 4,
          inProgressCount: 1,
          doneCount: 3,
          blockedCount: 0,
          queueDepth: 6,
          wipUtilization: 0.66,
          throughputLastHour: 12,
          throughputLast5Min: 3,
        },
      ],
    });

    await writeJson(workspace, 'state/analytics/orchestration_metrics.json', {
      updatedAt: '2025-10-27T00:00:00Z',
      totalDecisions: 3,
      byType: { critical: 1, strategic: 1, specialist: 1 },
      history: [
        { id: '1', taskId: 'T-1', type: 'critical', timestamp: '2025-10-27T00:00:00Z', quorumSatisfied: true },
        { id: '2', taskId: 'T-2', type: 'strategic', timestamp: '2025-10-27T00:05:00Z', quorumSatisfied: false },
        { id: '3', taskId: 'T-3', type: 'specialist', timestamp: '2025-10-27T00:10:00Z', quorumSatisfied: true },
      ],
    });

    await writeJson(workspace, 'state/limits/usage_log.json', {
      providers: {
        'claude:default': {
          provider: 'claude',
          usage: {
            current_hour: { requests: 20, tokens: 2000, reset_at: '2025-10-27T05:00:00Z' },
            current_day: { requests: 120, tokens: 18000, reset_at: '2025-10-27T05:00:00Z' },
          },
          warnings: {
            approaching_hourly_limit: false,
            approaching_daily_limit: false,
            percentage_used: 15,
          },
        },
      },
      last_saved: '2025-10-27T00:15:00Z',
    });
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('summarizes task metrics from the health report', async () => {
    const loader = new ObservabilityMetricsLoader(workspace);
    const provider = new ObservabilityMetricsProvider(loader, 0);

    const metrics = await provider.getTaskMetrics();

    expect(metrics.running).toBe(true);
    expect(metrics.tasksByState).toEqual({
      pending: 2,
      ready: 4,
      inProgress: 1,
      blocked: 0,
      done: 3,
    });
    expect(metrics.queueDepth).toBe(6);
    expect(metrics.throughputLastHour).toBe(12);
    expect(metrics.throughputLast5Min).toBe(3);
  });

  it('summarizes quality gate metrics with consensus rate', async () => {
    const loader = new ObservabilityMetricsLoader(workspace);
    const provider = new ObservabilityMetricsProvider(loader, 0);

    const quality = await provider.getQualityGateMetrics();

    expect(quality.totalDecisions).toBe(3);
    expect(quality.byType.critical).toBe(1);
    expect(quality.consensusReachRate).toBeCloseTo(2 / 3, 5);
  });

  it('serves metrics via the routing layer', async () => {
    const server = new ObservabilityServer({
      workspaceRoot: workspace,
    });

    const tasksPayload = (await server.fetch('/api/metrics/tasks')) as Record<string, unknown>;
    expect(tasksPayload.tasksByState).toBeDefined();

    const qualityPayload = (await server.fetch(
      '/api/metrics/quality_gates'
    )) as Record<string, unknown>;
    expect(qualityPayload.totalDecisions).toBe(3);
  });
});
