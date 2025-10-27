import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ObservabilityMetricsLoader } from '../metrics_loader.js';
import { ObservabilityMetricsProvider } from '../metrics_provider.js';
import { ObservabilityServer } from '../observability_server.js';

async function writeJson(baseDir: string, relative: string, data: unknown) {
  const target = path.join(baseDir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(data, null, 2), 'utf8');
}

async function writeJsonl(baseDir: string, relative: string, rows: unknown[]) {
  const target = path.join(baseDir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join('\n');
  await writeFile(target, content, 'utf8');
}

async function writeText(baseDir: string, relative: string, text: string) {
  const target = path.join(baseDir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');
}

describe('Observability metrics integration', () => {
  let workspace: string;
  let provider: ObservabilityMetricsProvider;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'obs-metrics-'));

    await writeJson(workspace, 'state/analytics/autopilot_health_report.json', {
      running: true,
      metricsHistory: [
        {
          timestamp: Date.parse('2025-10-27T00:00:00.000Z'),
          pendingCount: 3,
          readyCount: 1,
          inProgressCount: 2,
          blockedCount: 1,
          doneCount: 4,
          queueDepth: 7,
          wipUtilization: 0.56,
          throughputLastHour: 6,
          throughputLast5Min: 2,
        },
      ],
    });

    await writeJson(workspace, 'state/analytics/orchestration_metrics.json', {
      updatedAt: '2025-10-27T00:00:30.000Z',
      totalDecisions: 4,
      byType: { critical: 1, specialist: 3 },
      history: [
        {
          id: 'd1',
          taskId: 'T-1',
          type: 'critical',
          timestamp: '2025-10-27T00:00:01.000Z',
          quorumSatisfied: true,
        },
        {
          id: 'd2',
          taskId: 'T-2',
          type: 'specialist',
          timestamp: '2025-10-27T00:00:05.000Z',
          quorumSatisfied: false,
        },
      ],
    });

    await writeJsonl(workspace, 'state/analytics/quality_gate_decisions.jsonl', [
      {
        taskId: 'T-1',
        decision: 'APPROVED',
        reviews: {
          quality_gate: {
            approved: true,
            rubric: { maintainability: 4 },
            concerns: [],
          },
        },
      },
      {
        taskId: 'T-2',
        decision: 'REJECTED',
        finalReasoning: 'missing tests',
        reviews: {
          test_gate: {
            approved: false,
            rubric: { coverage: 2 },
            concerns: ['tests missing'],
          },
        },
      },
    ]);

    await writeJson(workspace, 'state/limits/usage_log.json', {
      providers: {
        'claude:default': {
          provider: 'claude',
          usage: {
            current_hour: { requests: 12, tokens: 1800 },
            current_day: { requests: 96, tokens: 24000 },
          },
          warnings: {
            approaching_hourly_limit: false,
            approaching_daily_limit: false,
            percentage_used: 18,
          },
        },
        'gpt:default': {
          provider: 'openai',
          usage: {
            current_hour: { requests: 5, tokens: 750 },
            current_day: { requests: 45, tokens: 9000 },
          },
          warnings: {
            approaching_hourly_limit: false,
            approaching_daily_limit: false,
            percentage_used: 9,
          },
        },
      },
      last_saved: '2025-10-27T00:10:00.000Z',
    });

    await writeJson(workspace, 'state/analytics/resource_metrics.json', {
      timestamp: '2025-10-27T00:09:00.000Z',
      memory_used_pct: 62.5,
      cpu_used_pct: 48.2,
      disk_used_pct: 71.1,
      claude_processes: 3,
      node_processes: 5,
      throttle_level: 1,
      throttle_params: { reason: 'rate-limit', cooldownSeconds: 30 },
    });

    await writeJson(workspace, 'state/analytics/provider_capacity_metrics.json', {
      lastUpdated: '2025-10-27T00:09:30.000Z',
      providers: [
        {
          provider: 'claude',
          totalLimitHits: 1,
          totalRecoveries: 1,
          totalFailovers: 0,
          averageDowntimeMs: 12000,
          longestDowntimeMs: 18000,
          shortestDowntimeMs: 4000,
          currentStatus: 'healthy',
        },
      ],
    });

    await writeJson(workspace, 'state/analytics/resolution_metrics.json', {
      updatedAt: '2025-10-27T00:08:00.000Z',
      activeLoops: [
        {
          taskId: 'T-2',
          attempts: 2,
          firstAttemptAt: '2025-10-27T00:03:00.000Z',
          lastAttemptAt: '2025-10-27T00:07:00.000Z',
          lastLabel: 'missing_dependency',
          labels: ['missing_dependency'],
          elapsedMs: 240000,
          runId: 'run-alpha',
          infiniteLoopFlag: true,
        },
      ],
      stats: {
        totalLoops: 3,
        closedLoops: 1,
        closedWithin3: 1,
        infiniteLoopCount: 1,
        incidentCount: 2,
        attemptHistogram: { '1': 2, '2': 1 },
      },
      recentEvents: [
        {
          type: 'attempt',
          taskId: 'T-2',
          label: 'missing_dependency',
          attempt: 2,
          timestamp: '2025-10-27T00:07:00.000Z',
          runId: 'run-alpha',
        },
      ],
      recentlyClosed: [
        {
          taskId: 'T-3',
          attempts: 1,
          closedAt: '2025-10-27T00:06:00.000Z',
          durationMs: 120000,
          runId: 'run-alpha',
        },
      ],
    });

    await writeJson(workspace, 'state/telemetry/metrics_summary.json', {
      operations: {
        latest_snapshot: {
          diskUsage: 68.9,
        },
      },
    });

    await writeText(
      workspace,
      'state/roadmap.yaml',
      [
        'epics:',
        '  - title: Observability',
        '    milestones:',
        '      - title: Dashboard',
        '        tasks:',
        '          - id: T-1',
        '            title: Build metrics feed',
        '            status: in_progress',
        '            domain: autopilot',
        '          - id: T-3',
        '            title: Document SSE usage',
        '            status: ready',
      ].join('\n')
    );

    const loader = new ObservabilityMetricsLoader(workspace);
    provider = new ObservabilityMetricsProvider(loader, 0);
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('aggregates observability metrics across data sources', async () => {
    const tasks = await provider.getTaskMetrics();
    expect(tasks.tasksByState.pending).toBe(3);
    expect(tasks.bottleneckStage).toBe('pending');
    expect(tasks.successRate).toBeCloseTo(0.5, 4);
    expect(tasks.retryRate).toBeCloseTo(1.5, 4);
    expect(tasks.drilldown?.inProgress?.[0]?.id).toBe('T-1');

    const quality = await provider.getQualityGateMetrics();
    expect(quality.totalDecisions).toBe(2);
    expect(quality.rejectionReasons[0]?.reason).toContain('missing');
    expect(quality.gateBreakdown.length).toBe(2);

    const resolution = await provider.getResolutionMetrics();
    expect(resolution.activeLoops[0]?.taskId).toBe('T-2');
    expect(resolution.stats.totalLoops).toBe(3);

    const resources = await provider.getResourceSnapshot();
    expect(resources.host.cpuPercent).toBeCloseTo(48.2);
    expect(resources.providers[0]?.provider).toBe('claude');
    expect(resources.estimatedCostPerTask).toBeGreaterThan(0);

    const csv = await provider.getTaskExportCsv();
    expect(csv.split('\n')[0]).toBe('state,count');

    const resolutionCsv = await provider.getResolutionExportCsv();
    expect(resolutionCsv.split('\n')[0]).toBe(
      'task_id,attempts,last_label,elapsed_ms,first_attempt_at,last_attempt_at'
    );

    const streamPayload = await provider.getStreamPayload();
    expect(streamPayload.tasks).toBeDefined();
    expect(streamPayload.quality).toBeDefined();
    expect(streamPayload.resolution).toBeDefined();
    expect(streamPayload.resources).toBeDefined();
  });

  it('serves metrics via observability server routes', async () => {
    const server = new ObservabilityServer({
      workspaceRoot: workspace,
      cacheTtlMs: 0,
      streamIntervalMs: 50,
    });

    const tasksPayload = (await server.fetch('/api/metrics/tasks')) as Record<
      string,
      unknown
    >;
    expect(tasksPayload).toHaveProperty('tasksByState');

    const resolutionPayload = (await server.fetch(
      '/api/metrics/resolution'
    )) as Record<string, unknown>;
    expect(resolutionPayload).toHaveProperty('activeLoops');

    const csv = (await server.fetch('/api/metrics/export/tasks')) as string;
    expect(typeof csv).toBe('string');
    expect(csv.startsWith('state,count')).toBe(true);
  });
});
