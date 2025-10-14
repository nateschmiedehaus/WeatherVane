import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

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
  getWorkspaceRoot(): string {
    return process.cwd();
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

describe('OperationsManager validation metrics', () => {
  it('captures validation failures in snapshots', () => {
    const stateMachine = new StubStateMachine();
    const scheduler = new StubScheduler();
    const agentPool = new StubAgentPool();
    const qualityMonitor = new StubQualityMonitor();

    const operations = new OperationsManager(
      stateMachine as unknown as any,
      scheduler as unknown as any,
      agentPool as unknown as any,
      qualityMonitor as unknown as any,
    );

    agentPool.emit('output:validation_failed', {
      taskId: 'T-validation',
      agentType: 'codex' as AgentType,
      code: 'invalid_json_schema',
      message: 'Schema mismatch',
      mode: 'shadow',
      enforced: true,
    });

    const snapshot = operations.getSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot?.validation.totalFailures).toBe(1);
    expect(snapshot?.validation.failuresLastHour).toBe(1);
    expect(snapshot?.validation.failuresByCode.invalid_json_schema).toBe(1);
    expect(snapshot?.validation.shadowFailures).toBe(1);
    expect(snapshot?.validation.mode).toBe('shadow');
    expect(snapshot?.validation.canaryAcknowledged).toBe(false);
  });
});
