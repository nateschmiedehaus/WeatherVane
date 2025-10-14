import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionFailureType } from '../orchestrator/agent_pool.js';
import { ResilienceManager } from '../orchestrator/resilience_manager.js';

class MockStateMachine extends EventEmitter {
  public createCheckpoint = vi.fn(async () => undefined);
  public addContextEntry = vi.fn();

  getTask(taskId: string) {
    return { id: taskId };
  }

  getRoadmapHealth() {
    return {
      totalTasks: 1,
      pendingTasks: 0,
      inProgressTasks: 1,
      completedTasks: 0,
      blockedTasks: 0,
      completionRate: 0.0,
      averageQualityScore: 0.95,
      currentPhase: 'foundation',
    };
  }
}

type AvailableAgentType = 'claude_code' | 'codex';

class MockAgentPool extends EventEmitter {
  public cooldowns: Array<{ agentId: string; seconds: number; mode: string }> = [];
  private availability: Record<AvailableAgentType, boolean> = {
    claude_code: true,
    codex: true,
  };

  setAvailability(type: AvailableAgentType, available: boolean) {
    this.availability[type] = available;
  }

  hasAvailableAgent(type: AvailableAgentType) {
    return this.availability[type];
  }

  imposeCooldown(agentId: string, seconds: number, mode: string) {
    this.cooldowns.push({ agentId, seconds, mode });
  }
}

const baseFailureContext = (overrides: Partial<{
  failureType: ExecutionFailureType;
  retryAfterSeconds: number;
  attemptNumber: number;
  agentId: string;
  taskId: string;
  originalError: string;
}> = {}) => ({
  taskId: 'T-recovery',
  agentId: 'codex_worker_0',
  failureType: 'other' as ExecutionFailureType,
  retryAfterSeconds: 30,
  attemptNumber: 1,
  originalError: 'synthetic failure',
  ...overrides,
});

describe('ResilienceManager', () => {
  let stateMachine: MockStateMachine;
  let agentPool: MockAgentPool;
  let manager: ResilienceManager;

  beforeEach(() => {
    stateMachine = new MockStateMachine();
    agentPool = new MockAgentPool();
    manager = new ResilienceManager(stateMachine as unknown as any, agentPool as unknown as any);
  });

  it('reassigns to alternate agent after rate limit and records cooldown', async () => {
    agentPool.setAvailability('claude_code', true);
    const result = await manager.handleFailure(baseFailureContext({
      failureType: 'rate_limit',
      retryAfterSeconds: 120,
      agentId: 'codex_worker_1',
    }));

    expect(agentPool.cooldowns).toHaveLength(1);
    expect(agentPool.cooldowns[0]).toEqual({
      agentId: 'codex_worker_1',
      seconds: 120,
      mode: 'usage_limit',
    });

    expect(result).toEqual({
      action: 'reassign',
      delaySeconds: 5,
      newAgentType: 'claude_code',
      reasoning: expect.stringContaining('Rate limit'),
    });
  });

  it('waits and retries when alternate agent is unavailable after rate limit', async () => {
    agentPool.setAvailability('claude_code', false);
    agentPool.setAvailability('codex', false);

    const result = await manager.handleFailure(baseFailureContext({
      failureType: 'rate_limit',
      retryAfterSeconds: 90,
      agentId: 'claude_code_primary',
    }));

    expect(result.action).toBe('retry');
    expect(result.delaySeconds).toBe(90);
    expect(result.reasoning).toContain('All agents busy');
  });

  it('creates checkpoint and retries fresh session after context limit', async () => {
    const result = await manager.handleFailure(baseFailureContext({
      failureType: 'context_limit',
      agentId: 'claude_code_primary',
    }));

    expect(stateMachine.createCheckpoint).toHaveBeenCalledTimes(1);
    expect(stateMachine.addContextEntry).toHaveBeenCalledTimes(1);

    expect(result.action).toBe('checkpoint_and_retry');
    expect(result.reasoning).toContain('Context limit exceeded');
  });

  it('fails task when context limits happen within cooldown window', async () => {
    await manager.handleFailure(baseFailureContext({
      failureType: 'context_limit',
      agentId: 'claude_code_primary',
    }));

    const second = await manager.handleFailure(baseFailureContext({
      failureType: 'context_limit',
      agentId: 'claude_code_primary',
      attemptNumber: 2,
    }));

    expect(second.action).toBe('fail_task');
    expect(second.reasoning).toContain('too frequently');
    expect(stateMachine.createCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('escalates validation failures to fail_task after exceeding retry budget', async () => {
    const actions: Array<string> = [];

    for (let index = 1; index <= 4; index += 1) {
      const response = await manager.handleFailure(baseFailureContext({
        failureType: 'validation',
        attemptNumber: index,
      }));
      actions.push(response.action);
    }

    expect(actions).toEqual(['retry', 'retry', 'retry', 'fail_task']);
  });

  it('applies exponential backoff for generic failures before failing task', async () => {
    const responses: Array<{ delaySeconds?: number; action: string }> = [];

    for (let index = 1; index <= 4; index += 1) {
      const response = await manager.handleFailure(baseFailureContext({
        failureType: 'other',
        attemptNumber: index,
      }));
      responses.push({ delaySeconds: response.delaySeconds, action: response.action });
    }

    expect(responses[0]).toEqual({ delaySeconds: 30, action: 'retry' });
    expect(responses[1]).toEqual({ delaySeconds: 60, action: 'retry' });
    expect(responses[2]).toEqual({ delaySeconds: 120, action: 'retry' });
    expect(responses[3]).toEqual({ delaySeconds: undefined, action: 'fail_task' });
  });
});
