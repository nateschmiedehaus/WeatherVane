import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SelfImprovementManager, type PhaseCompletionStatus } from '../orchestrator/self_improvement_manager.js';
import { StateMachine } from '../orchestrator/state_machine.js';

describe('SelfImprovementManager correlation IDs', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;
  let manager: SelfImprovementManager;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'wvo-self-improve-'));
    stateMachine = new StateMachine(workspaceRoot);
    manager = new SelfImprovementManager(stateMachine, {
      maxRestartsPerWindow: 1,
      restartWindowMinutes: 10,
      enableAutoRestart: false,
      workspaceRoot,
    });
  });

  afterEach(() => {
    stateMachine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('threads correlation IDs when blocking and unblocking product work', async () => {
    stateMachine.createTask(
      {
        id: 'PHASE-4-POLISH',
        title: 'Phase: Polish',
        type: 'epic',
        status: 'in_progress',
      },
      'test:phase',
    );

    stateMachine.createTask(
      {
        id: 'T-product',
        title: 'Product work candidate',
        type: 'task',
        status: 'pending',
      },
      'test:product',
    );

    const correlationBase = 'self-improvement:test-phase';
    const phaseStatus: PhaseCompletionStatus = {
      phase: 'PHASE-4-POLISH',
      complete: false,
      taskIds: ['PHASE-4-POLISH'],
      lastChecked: Date.now(),
    };

    await (manager as any).enforceMetaWorkFocus([phaseStatus], correlationBase);

    const blockedTask = stateMachine.getTask('T-product');
    expect(blockedTask?.status).toBe('blocked');

    const eventsAfterBlock = stateMachine.getEvents({ taskId: 'T-product' });
    const blockEvent = eventsAfterBlock.find(event => event.data?.to === 'blocked');
    expect(blockEvent?.correlation_id).toBe('self-improvement:test-phase:enforce:T-product:blocked');

    await (manager as any).unblockProductWork(correlationBase);

    const unblockedTask = stateMachine.getTask('T-product');
    expect(unblockedTask?.status).toBe('pending');
    expect(unblockedTask?.metadata).toMatchObject({ meta_work_complete: true });
    expect(unblockedTask?.metadata).not.toHaveProperty('blocked_by_meta_work');
    expect(unblockedTask?.metadata).not.toHaveProperty('blocking_phases');
    expect(unblockedTask?.metadata).not.toHaveProperty('meta_focus_enforced_at');

    const eventsAfterUnblock = stateMachine.getEvents({ taskId: 'T-product' });
    const unblockEvent = eventsAfterUnblock.find(event => event.data?.to === 'pending');
    expect(unblockEvent?.correlation_id).toBe('self-improvement:test-phase:unblock:T-product:pending');
  });
});
