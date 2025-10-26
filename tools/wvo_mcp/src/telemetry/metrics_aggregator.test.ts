import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MetricsAggregator } from './metrics_aggregator.js';
import type { MetricsRecord } from './metrics_collector.js';

describe('MetricsAggregator', () => {
  let tmpDir: string;
  let aggregator: MetricsAggregator;
  let metricsPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aggregator-test-'));
    aggregator = new MetricsAggregator(tmpDir);
    metricsPath = path.join(tmpDir, 'state', 'telemetry', 'metrics.jsonl');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const createRecord = (overrides?: {
    timestamp?: string;
    tags?: Partial<MetricsRecord['tags']>;
    quality?: Partial<MetricsRecord['quality']>;
    efficiency?: Partial<MetricsRecord['efficiency']>;
    learning?: MetricsRecord['learning'];
    systemHealth?: Partial<MetricsRecord['systemHealth']>;
  }): MetricsRecord => {
    const defaultRecord: MetricsRecord = {
      timestamp: new Date().toISOString(),
      tags: {
        taskId: 'T1',
        taskType: 'feature',
        taskTypeConfidence: 0.9,
        complexityTier: 'medium',
        complexityScore: 5,
        modelProvider: 'codex',
        usedComplexityRouter: true,
        usedWIPController: true,
        usedThinkStage: false,
        usedResolutionEngine: false,
      },
      quality: {
        taskSucceeded: true,
        firstPassReview: true,
        iterationCount: 2,
        testCoverageDelta: 0.05,
        regressionIntroduced: false,
      },
      efficiency: {
        durationMs: 120000,
        promptTokens: 5000,
        completionTokens: 2000,
        totalTokens: 7000,
        costUsd: 0.42,
        retryOverheadTokens: 0,
      },
      learning: {},
      systemHealth: {
        providerAvailable: true,
        rateLimitHit: false,
        circuitBreakerTripped: false,
      },
    };

    if (!overrides) return defaultRecord;

    return {
      timestamp: overrides.timestamp ?? defaultRecord.timestamp,
      tags: { ...defaultRecord.tags, ...overrides.tags },
      quality: { ...defaultRecord.quality, ...overrides.quality },
      efficiency: { ...defaultRecord.efficiency, ...overrides.efficiency },
      learning: overrides.learning ?? defaultRecord.learning,
      systemHealth: { ...defaultRecord.systemHealth, ...overrides.systemHealth },
    };
  };

  const writeRecords = async (records: MetricsRecord[]) => {
    await fs.mkdir(path.dirname(metricsPath), { recursive: true });
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.writeFile(metricsPath, lines);
  };

  it('computes dashboard with empty metrics', async () => {
    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.metadata.dataQuality).toBe('insufficient');
    expect(dashboard.metadata.sampleSize).toBe(0);
    expect(dashboard.metadata.warnings).toContain('No metrics data available');
    expect(dashboard.summary.tasksCompleted).toBe(0);
    expect(dashboard.summary.tasksFailed).toBe(0);
  });

  it('computes basic summary metrics', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1' }, quality: { taskSucceeded: true } }),
      createRecord({ tags: { taskId: 'T2' }, quality: { taskSucceeded: true } }),
      createRecord({ tags: { taskId: 'T3' }, quality: { taskSucceeded: false } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.summary.tasksCompleted).toBe(2);
    expect(dashboard.summary.tasksFailed).toBe(1);
    expect(dashboard.summary.successRate).toBeCloseTo(0.667, 2);
    expect(dashboard.summary.totalTokens).toBe(21000); // 7000 * 3
    expect(dashboard.summary.totalCostUsd).toBeCloseTo(1.26, 2); // 0.42 * 3
  });

  it('segments metrics by task type', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1', taskType: 'feature' }, efficiency: { costUsd: 0.50 } }),
      createRecord({ tags: { taskId: 'T2', taskType: 'feature' }, efficiency: { costUsd: 0.60 } }),
      createRecord({ tags: { taskId: 'T3', taskType: 'bug' }, efficiency: { costUsd: 0.20 } }),
      createRecord({ tags: { taskId: 'T4', taskType: 'docs' }, efficiency: { costUsd: 0.10 } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.byTaskType.feature.count).toBe(2);
    expect(dashboard.byTaskType.feature.avgCostUsd).toBeCloseTo(0.55, 2);
    expect(dashboard.byTaskType.bug.count).toBe(1);
    expect(dashboard.byTaskType.bug.avgCostUsd).toBeCloseTo(0.20, 2);
    expect(dashboard.byTaskType.docs.count).toBe(1);
    expect(dashboard.byTaskType.docs.avgCostUsd).toBeCloseTo(0.10, 2);
  });

  it('segments metrics by complexity tier', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1', complexityTier: 'low' }, quality: { iterationCount: 1 } }),
      createRecord({ tags: { taskId: 'T2', complexityTier: 'medium' }, quality: { iterationCount: 2 } }),
      createRecord({ tags: { taskId: 'T3', complexityTier: 'high' }, quality: { iterationCount: 4 } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.byComplexityTier.low.count).toBe(1);
    expect(dashboard.byComplexityTier.low.avgIterations).toBe(1);
    expect(dashboard.byComplexityTier.medium.count).toBe(1);
    expect(dashboard.byComplexityTier.medium.avgIterations).toBe(2);
    expect(dashboard.byComplexityTier.high.count).toBe(1);
    expect(dashboard.byComplexityTier.high.avgIterations).toBe(4);
  });

  it('segments metrics by epic', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1', epic: 'E1' }, efficiency: { costUsd: 0.40 } }),
      createRecord({ tags: { taskId: 'T2', epic: 'E1' }, efficiency: { costUsd: 0.50 } }),
      createRecord({ tags: { taskId: 'T3', epic: 'E2' }, efficiency: { costUsd: 0.30 } }),
      createRecord({ tags: { taskId: 'T4', epic: 'E2' }, efficiency: { costUsd: 0.35 } }),
      createRecord({ tags: { taskId: 'T5', epic: 'E2' }, efficiency: { costUsd: 0.32 } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.byEpic['E1'].count).toBe(2);
    expect(dashboard.byEpic['E1'].avgCostUsd).toBeCloseTo(0.45, 2);
    expect(dashboard.byEpic['E2'].count).toBe(3);
    expect(dashboard.byEpic['E2'].avgCostUsd).toBeCloseTo(0.323, 2);
  });

  it('segments metrics by milestone', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1', milestone: 'M1' }, quality: { iterationCount: 1 } }),
      createRecord({ tags: { taskId: 'T2', milestone: 'M1' }, quality: { iterationCount: 2 } }),
      createRecord({ tags: { taskId: 'T3', milestone: 'M2' }, quality: { iterationCount: 3 } }),
      createRecord({ tags: { taskId: 'T4', milestone: 'M2' }, quality: { iterationCount: 4 } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.byMilestone['M1'].count).toBe(2);
    expect(dashboard.byMilestone['M1'].avgIterations).toBe(1.5);
    expect(dashboard.byMilestone['M2'].count).toBe(2);
    expect(dashboard.byMilestone['M2'].avgIterations).toBe(3.5);
  });

  it('calculates percentiles correctly', async () => {
    const records = [
      createRecord({ efficiency: { durationMs: 60000 } }), // 1min
      createRecord({ efficiency: { durationMs: 120000 } }), // 2min
      createRecord({ efficiency: { durationMs: 180000 } }), // 3min
      createRecord({ efficiency: { durationMs: 240000 } }), // 4min
      createRecord({ efficiency: { durationMs: 600000 } }), // 10min
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    // p50 should be around 3min (middle value)
    expect(dashboard.byTaskType.feature.p50TimeMin).toBeGreaterThan(2);
    expect(dashboard.byTaskType.feature.p50TimeMin).toBeLessThan(4);

    // p95 should be around 10min
    expect(dashboard.byTaskType.feature.p95TimeMin).toBeGreaterThan(8);
  });

  it('measures THINK stage effectiveness', async () => {
    const records = [
      // With THINK stage: lower cost, fewer iterations
      createRecord({
        tags: { taskId: 'T1', usedThinkStage: true },
        quality: { iterationCount: 1 },
        efficiency: { costUsd: 0.30 },
      }),
      createRecord({
        tags: { taskId: 'T2', usedThinkStage: true },
        quality: { iterationCount: 2 },
        efficiency: { costUsd: 0.35 },
      }),
      createRecord({
        tags: { taskId: 'T3', usedThinkStage: true },
        quality: { iterationCount: 1 },
        efficiency: { costUsd: 0.32 },
      }),
      createRecord({
        tags: { taskId: 'T4', usedThinkStage: true },
        quality: { iterationCount: 2 },
        efficiency: { costUsd: 0.38 },
      }),
      createRecord({
        tags: { taskId: 'T5', usedThinkStage: true },
        quality: { iterationCount: 1 },
        efficiency: { costUsd: 0.30 },
      }),

      // Without THINK stage: higher cost, more iterations
      createRecord({
        tags: { taskId: 'T6', usedThinkStage: false },
        quality: { iterationCount: 3 },
        efficiency: { costUsd: 0.50 },
      }),
      createRecord({
        tags: { taskId: 'T7', usedThinkStage: false },
        quality: { iterationCount: 2 },
        efficiency: { costUsd: 0.45 },
      }),
      createRecord({
        tags: { taskId: 'T8', usedThinkStage: false },
        quality: { iterationCount: 3 },
        efficiency: { costUsd: 0.48 },
      }),
      createRecord({
        tags: { taskId: 'T9', usedThinkStage: false },
        quality: { iterationCount: 4 },
        efficiency: { costUsd: 0.55 },
      }),
      createRecord({
        tags: { taskId: 'T10', usedThinkStage: false },
        quality: { iterationCount: 2 },
        efficiency: { costUsd: 0.42 },
      }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    const thinkStage = dashboard.featureEffectiveness.thinkStage;

    expect(thinkStage.used.count).toBe(5);
    expect(thinkStage.notUsed.count).toBe(5);
    expect(thinkStage.used.avgCostUsd).toBeLessThan(thinkStage.notUsed.avgCostUsd);
    expect(thinkStage.used.avgIterations).toBeLessThan(thinkStage.notUsed.avgIterations);
    expect(thinkStage.roi).toContain('cost savings');
  });

  it('measures ComplexityRouter accuracy', async () => {
    const records = [
      // Optimal: low tier, 1 iteration (expected 1)
      createRecord({
        tags: { taskId: 'T1', complexityTier: 'low', usedComplexityRouter: true },
        quality: { iterationCount: 1 },
      }),
      // Optimal: medium tier, 2 iterations (expected 2)
      createRecord({
        tags: { taskId: 'T2', complexityTier: 'medium', usedComplexityRouter: true },
        quality: { iterationCount: 2 },
      }),
      // Overprovisioned: high tier, 1 iteration (expected 3, got 1)
      createRecord({
        tags: { taskId: 'T3', complexityTier: 'high', usedComplexityRouter: true },
        quality: { iterationCount: 1 },
      }),
      // Underprovisioned: low tier, 4 iterations (expected 1, got 4)
      createRecord({
        tags: { taskId: 'T4', complexityTier: 'low', usedComplexityRouter: true },
        quality: { iterationCount: 4 },
      }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    const router = dashboard.featureEffectiveness.complexityRouter;

    expect(router.accuracy).toBe(0.5); // 2 out of 4 optimal
    expect(router.overprovisioned).toBe(1);
    expect(router.underprovisioned).toBe(1);
  });

  it('generates recommendations for low success rate', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1' }, quality: { taskSucceeded: true } }),
      createRecord({ tags: { taskId: 'T2' }, quality: { taskSucceeded: false } }),
      createRecord({ tags: { taskId: 'T3' }, quality: { taskSucceeded: false } }),
      createRecord({ tags: { taskId: 'T4' }, quality: { taskSucceeded: false } }),
      createRecord({ tags: { taskId: 'T5' }, quality: { taskSucceeded: false } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.summary.successRate).toBe(0.2);
    expect(dashboard.recommendations.some((r) => r.includes('HIGH PRIORITY'))).toBe(true);
    expect(dashboard.recommendations.some((r) => r.includes('success rate'))).toBe(true);
  });

  it('generates recommendations for high cost', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      createRecord({
        tags: { taskId: `T${i + 1}` },
        efficiency: { costUsd: 1.50 }, // Above $1.00 target
      })
    );

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.summary.avgCostPerTaskUsd).toBe(1.50);
    expect(dashboard.recommendations.some((r) => r.includes('cost per task'))).toBe(true);
  });

  it('computes 7-day trends', async () => {
    const now = new Date();
    const records: MetricsRecord[] = [];

    // Create 7 days of records with improving metrics
    for (let day = 0; day < 7; day++) {
      const timestamp = new Date(now.getTime() - (6 - day) * 24 * 60 * 60 * 1000);
      const successRate = 0.50 + day * 0.08; // Improving from 50% to 98%
      const cost = 0.60 - day * 0.05; // Decreasing from 0.60 to 0.30

      for (let task = 0; task < 5; task++) {
        // Deterministic success based on task index to ensure trend
        const succeeded = task < Math.floor(successRate * 5);
        records.push(
          createRecord({
            timestamp: timestamp.toISOString(),
            tags: { taskId: `T-day${day}-task${task}` },
            quality: { taskSucceeded: succeeded },
            efficiency: { costUsd: cost },
          })
        );
      }
    }

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.trends.successRate7d.length).toBe(7);
    expect(dashboard.trends.avgCost7d.length).toBe(7);

    // Trends should show improvement
    const firstDay = dashboard.trends.successRate7d[0];
    const lastDay = dashboard.trends.successRate7d[6];
    expect(lastDay).toBeGreaterThan(firstDay);
  });

  it('writes dashboard to disk', async () => {
    const records = [
      createRecord({ tags: { taskId: 'T1' } }),
      createRecord({ tags: { taskId: 'T2' } }),
    ];

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();
    await aggregator.writeDashboard(dashboard);

    const dashboardPath = path.join(tmpDir, 'state', 'analytics', 'metrics_dashboard.json');
    const content = await fs.readFile(dashboardPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.summary.tasksCompleted).toBe(2);
    expect(parsed.metadata).toBeDefined();
    expect(parsed.recommendations).toBeDefined();
  });

  it('handles insufficient data gracefully', async () => {
    const records = [createRecord({ tags: { taskId: 'T1' } })]; // Only 1 task

    await writeRecords(records);

    const dashboard = await aggregator.computeDashboard();

    expect(dashboard.metadata.dataQuality).toBe('insufficient');
    expect(dashboard.metadata.warnings.some((w) => w.includes('Small sample size'))).toBe(true);
    expect(dashboard.recommendations.some((r) => r.includes('Insufficient data'))).toBe(true);
  });
});
