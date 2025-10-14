import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AgentType } from '../orchestrator/agent_pool.js';
import { OperationsManager } from '../orchestrator/operations_manager.js';

class StubAgentPool extends EventEmitter {
  getUsageRatio() {
    return { codex: 0, claude: 0, ratio: 0 };
  }

  getAvailableAgents(): Array<{ id: string; type: AgentType }> {
    return [];
  }

  getBusyAgents(): Array<{ id: string; type: AgentType }> {
    return [];
  }

  isCoordinatorAvailable(): boolean {
    return true;
  }

  getCoordinatorType(): AgentType {
    return 'claude_code';
  }

  promoteCoordinatorRole(): void {
    // no-op for tests
  }

  demoteCoordinatorRole(): void {
    // no-op for tests
  }

  hasAvailableAgent(): boolean {
    return true;
  }
}

class StubScheduler extends EventEmitter {
  setPriorityProfile(): void {
    // no-op
  }

  getQueueLength(): number {
    return 0;
  }

  getQueueMetrics() {
    return {
      updatedAt: Date.now(),
      size: 0,
      reasonCounts: {
        requires_review: 0,
        requires_follow_up: 0,
        dependencies_cleared: 0,
      },
      heads: {
        requires_review: [],
        requires_follow_up: [],
        dependencies_cleared: [],
      },
      resource: {
        heavyTaskLimit: 1,
        activeHeavyTasks: 0,
        queuedHeavyTasks: 0,
      },
    };
  }
}

class StubQualityMonitor extends EventEmitter {}

class StubStateMachine extends EventEmitter {
  constructor(private readonly root = process.cwd()) {
    super();
  }

  getWorkspaceRoot(): string {
    return this.root;
  }

  getAverageQualityScore(): number {
    return 0.9;
  }

  getRoadmapHealth() {
    return {
      totalTasks: 1,
      pendingTasks: 1,
      inProgressTasks: 0,
      completedTasks: 0,
      blockedTasks: 0,
      completionRate: 0,
      averageQualityScore: 0.9,
      currentPhase: 'foundation',
    };
  }

  getTasks() {
    return [];
  }
}

describe('OperationsManager cost tracking', () => {
  beforeEach(() => {
    process.env.WVO_BUDGET_CODEX_DAILY_USD = '1.0';
    process.env.WVO_BUDGET_CODEX_HOURLY_USD = '0.5';
    process.env.WVO_BUDGET_CLAUDE_DAILY_USD = '1.0';
    process.env.WVO_BUDGET_CLAUDE_HOURLY_USD = '0.5';
    process.env.WVO_BUDGET_ALERT_THRESHOLD_PERCENT = '0.5';
    process.env.WVO_DISABLE_BUDGET_CONTEXT_ALERTS = '1';
  });

  afterEach(() => {
    delete process.env.WVO_BUDGET_CODEX_DAILY_USD;
    delete process.env.WVO_BUDGET_CODEX_HOURLY_USD;
    delete process.env.WVO_BUDGET_CLAUDE_DAILY_USD;
    delete process.env.WVO_BUDGET_CLAUDE_HOURLY_USD;
    delete process.env.WVO_BUDGET_ALERT_THRESHOLD_PERCENT;
    delete process.env.WVO_DISABLE_BUDGET_CONTEXT_ALERTS;
  });

  const createOperationsManager = (workspaceRoot?: string): OperationsManager => {
    const stateMachine = new StubStateMachine(workspaceRoot);
    const scheduler = new StubScheduler();
    const agentPool = new StubAgentPool();
    const qualityMonitor = new StubQualityMonitor();

    return new OperationsManager(
      stateMachine as unknown as any,
      scheduler as unknown as any,
      agentPool as unknown as any,
      qualityMonitor as unknown as any,
    );
  };

  it('raises warning alerts when approaching provider budgets', () => {
    const operations = createOperationsManager();
    try {
      operations.recordExecution({
        taskId: 'T-budget-warning',
        agentId: 'codex_worker_1',
        agentType: 'codex',
        success: true,
        finalStatus: 'done',
        durationSeconds: 10,
        qualityScore: 1,
        issues: [],
        timestamp: Date.now(),
        projectPhase: 'phase-1',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        tokenCostUSD: 0.3,
        tokenEstimateStrategy: 'reported',
      });

      const snapshot = operations.getSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot?.costs.providers.codex.status).toBe('warning');
      expect(snapshot?.costs.alerts.some((alert) => alert.severity === 'warning')).toBe(true);
    } finally {
      operations.stop();
    }
  });

  it('appends budget alerts to context when enabled', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-manager-costs-'));
    const stateDir = path.join(tempRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(path.join(stateDir, 'telemetry'), { recursive: true });

    process.env.WVO_DISABLE_BUDGET_CONTEXT_ALERTS = '0';
    process.env.WVO_BUDGET_CODEX_DAILY_USD = '0.05';
    process.env.WVO_BUDGET_CODEX_HOURLY_USD = '0.05';

    const operations = createOperationsManager(tempRoot);
    try {
      operations.recordExecution({
        taskId: 'T-budget-context',
        agentId: 'codex_worker_3',
        agentType: 'codex',
        success: true,
        finalStatus: 'done',
        durationSeconds: 8,
        qualityScore: 1,
        issues: [],
        timestamp: Date.now(),
        projectPhase: 'phase-1',
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
        tokenCostUSD: 0.1,
        tokenEstimateStrategy: 'reported',
      });

      const contextPath = path.join(stateDir, 'context.md');
      const contextContent = fs.readFileSync(contextPath, 'utf8');
      expect(contextContent).toMatch(/Budget (WARNING|CRITICAL) for codex/);
    } finally {
      operations.stop();
      await new Promise((resolve) => setTimeout(resolve, 50));
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('marks budgets as critical when exceeding limits', () => {
    const operations = createOperationsManager();
    try {
      operations.recordExecution({
        taskId: 'T-budget-critical',
        agentId: 'codex_worker_2',
        agentType: 'codex',
        success: true,
        finalStatus: 'done',
        durationSeconds: 12,
        qualityScore: 1,
        issues: [],
        timestamp: Date.now(),
        projectPhase: 'phase-1',
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
        tokenCostUSD: 0.6,
        tokenEstimateStrategy: 'reported',
      });

      operations.recordExecution({
        taskId: 'T-budget-critical-followup',
        agentId: 'claude_code',
        agentType: 'claude_code',
        success: true,
        finalStatus: 'done',
        durationSeconds: 5,
        qualityScore: 1,
        issues: [],
        timestamp: Date.now(),
        projectPhase: 'phase-1',
        promptTokens: 6,
        completionTokens: 4,
        totalTokens: 10,
        tokenCostUSD: 0,
        tokenEstimateStrategy: 'reported',
      });

      const snapshot = operations.getSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot?.costs.providers.codex.status).toBe('critical');
      expect(snapshot?.costs.alerts.some((alert) => alert.severity === 'critical')).toBe(true);
      expect(snapshot?.mode).toBe('stabilize');
    } finally {
      operations.stop();
    }
  });
});
