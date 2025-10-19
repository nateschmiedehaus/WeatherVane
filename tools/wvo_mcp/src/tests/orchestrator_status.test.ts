import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { WorkerToolRouter } from '../worker/tool_router.js';

class StubSession {}

class StubResilienceManager {
  getMetrics() {
    return {
      tasksWithRetries: 0,
      totalRetryAttempts: 0,
      recentContextLimits: 0,
    };
  }
}

class StubRuntime {
  constructor(private readonly snapshot: any, private readonly stateMachine: any) {}

  getOperationsManager() {
    return {
      getSnapshot: () => this.snapshot,
    };
  }

  getStateMachine() {
    return this.stateMachine;
  }

  getResilienceManager() {
    return new StubResilienceManager();
  }
}

class StubStateMachine {
  getRoadmapHealth() {
    return {
      totalTasks: 3,
      completedTasks: 1,
      completionRate: 1 / 3,
      blockedTasks: 0,
      currentPhase: 'foundation',
      averageQualityScore: 0.9,
    };
  }
}

class StubAuthChecker {
  async checkAll() {
    return {
      codex: { authenticated: true },
      claude_code: { authenticated: true },
    };
  }
}

describe('orchestrator_status payload', () => {
  it('includes shadow diff summary when present', async () => {
    const now = Date.now();
    const snapshot = {
      avgQuality: 0.9,
      failureRate: 0,
      codexUsagePercent: 10,
      claudeUsagePercent: 90,
      codexToClaudeRatio: 0.11,
      queueLength: 0,
      blockedTasks: 0,
      totalTasks: 3,
      mode: 'balance',
      timestamp: now,
      rateLimitCodex: 0,
      rateLimitClaude: 0,
      coordinatorType: 'claude_code',
      coordinatorAvailable: true,
      coordinatorReason: 'nominal',
      codexPresetStats: {},
      agent_pool: {
        total_agents: 1,
        busy_agents: 0,
        idle_agents: 1,
        codex_usage_percent: 10,
        claude_usage_percent: 90,
      },
      queue: {
        ready_count: 0,
        pending_count: 0,
        review_count: 0,
        improvement_count: 0,
        batches: [],
        resource: {
          heavy_limit: 1,
          active_heavy: 0,
          queued_heavy: 0,
        },
        shadow_diffs: {
          count: 2,
          path: 'experiments/mcp/upgrade/mock/shadow.json',
          recorded_at: now,
        },
      },
      quality: {
        total_executions: 0,
        avg_duration_seconds: 0,
      },
      health_status: 'healthy',
      webInspiration: {
        enabled: false,
        totalFetches: 0,
        successes: 0,
        failures: 0,
        cacheHits: 0,
        averageDurationMs: 0,
        averageSizeKb: 0,
        topCategories: [],
      },
      networkFailureCount: 0,
      tokenMetrics: {
        averagePromptTokens: 0,
        averageCompletionTokens: 0,
        averageTotalTokens: 0,
        pressure: 'normal',
        targetPromptBudget: 600,
        cacheEligibleExecutions: 0,
        cacheHitExecutions: 0,
        cacheStoreExecutions: 0,
        cacheHitRate: 0,
      },
      validation: {
        totalFailures: 0,
        failuresLastHour: 0,
        recentFailureRate: 0,
        failuresByCode: {},
        shadowFailures: 0,
        enforcedFailures: 0,
        mode: 'shadow',
        canaryAcknowledged: false,
        retryRate: 0,
        recoveries: {
          retries: 0,
          reassignments: 0,
          failures: 0,
          lastRecoveryAt: undefined,
        },
      },
      costs: {
        lastUpdated: now,
        windowSeconds: 86400,
        lastHourUSD: 0,
        last24hUSD: 0,
        providers: {
          codex: {
            status: 'normal',
            lastHourUSD: 0,
            last24hUSD: 0,
            budget: { hourlyLimitUSD: 5, dailyLimitUSD: 25, alertThresholdPercent: 0.8 },
            hourlyUtilizationPercent: 0,
            dailyUtilizationPercent: 0,
          },
          claude_code: {
            status: 'normal',
            lastHourUSD: 0,
            last24hUSD: 0,
            budget: { hourlyLimitUSD: 4, dailyLimitUSD: 20, alertThresholdPercent: 0.8 },
            hourlyUtilizationPercent: 0,
            dailyUtilizationPercent: 0,
          },
        },
        alerts: [],
      },
      velocity: undefined,
    };

    const runtime = new StubRuntime(snapshot, new StubStateMachine());
    const router = new WorkerToolRouter(
      new StubSession() as unknown as any,
      runtime as unknown as any,
      new StubAuthChecker() as unknown as any,
    );

    const response = await router.runTool({ name: 'orchestrator_status', input: {} });
    const result = response as { content: Array<{ text: string }> };
    const text = result.content[0]?.text ?? '';
    const match = text.match(/```json\r?\n([\s\S]+?)\r?\n```/);
    const payload = JSON.parse(text);

    expect(payload).toHaveProperty('snapshot');
    expect(payload.snapshot.queue.shadow_diffs).toEqual({
      count: 2,
      path: 'experiments/mcp/upgrade/mock/shadow.json',
      recorded_at: expect.any(Number),
    });
  });
});
