import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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

  promoteCoordinatorRole(): void {}
  demoteCoordinatorRole(): void {}
  hasAvailableAgent(): boolean {
    return true;
  }
}

class StubScheduler extends EventEmitter {
  constructor(private readonly metrics: any) {
    super();
  }

  setPriorityProfile(): void {}

  getQueueLength(): number {
    return this.metrics.size;
  }

  getQueueMetrics() {
    return this.metrics;
  }

  getVelocityMetrics() {
    return { completedTasks: 0, tasksPerHour: 0, averageCompletionTime: 0, inProgressCount: 0, stalledCount: 0 };
  }

  detectStuckTasks(): Array<any> {
    return [];
  }
}

class StubQualityMonitor extends EventEmitter {}

class StubStateMachine extends EventEmitter {
  constructor(private readonly root: string) {
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

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tmpDirs.length = 0;
});

describe('OperationsManager shadow summary', () => {
  it('includes shadow diff metadata in queue snapshot', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'ops-shadow-'));
    tmpDirs.push(workspaceRoot);

    const summaryDir = path.join(workspaceRoot, 'state', 'analytics');
    await mkdir(summaryDir, { recursive: true });
    await writeFile(
      path.join(summaryDir, 'upgrade_shadow.json'),
      JSON.stringify({
        diff_count: 2,
        diff_path: 'experiments/mcp/upgrade/latest/shadow.json',
        recorded_at: '2025-10-17T00:00:00Z',
      }),
      'utf8',
    );

    const schedulerMetrics = {
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

    const stateMachine = new StubStateMachine(workspaceRoot);
    const scheduler = new StubScheduler(schedulerMetrics);
    const agentPool = new StubAgentPool();
    const qualityMonitor = new StubQualityMonitor();

    const operations = new OperationsManager(
      stateMachine as unknown as any,
      scheduler as unknown as any,
      agentPool as unknown as any,
      qualityMonitor as unknown as any,
    );

    (operations as any).recomputeStrategy('test');
    const snapshot = operations.getSnapshot();
    expect(snapshot?.queue.shadow_diffs).toEqual({
      count: 2,
      path: 'experiments/mcp/upgrade/latest/shadow.json',
      recorded_at: expect.any(Number),
    });
  });
});
