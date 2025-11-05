import { describe, expect, it } from 'vitest';

import {
  WORK_PROCESS_PHASES,
  WorkProcessEnforcer,
  assertLedgerCompleteness,
} from './index.js';

const makeClock = () => {
  let tick = 0;
  return () => new Date(Date.UTC(2025, 0, 1, 0, 0, tick++));
};

describe('WorkProcessEnforcer', () => {
  it('enforces sequential phases and builds hash chain', async () => {
    const enforcer = WorkProcessEnforcer.createInMemory(makeClock());
    const taskId = 'T-001';

    for (const phase of WORK_PROCESS_PHASES) {
      await enforcer.recordTransition({
        taskId,
        phase,
        actorId: 'agent',
        evidencePath: `state/evidence/${taskId}/${phase}.md`,
      });
    }

    await expect(
      enforcer.recordTransition({
        taskId,
        phase: 'monitor',
        actorId: 'agent',
        evidencePath: 'state/evidence/redundant',
      }),
    ).rejects.toThrow(/already completed/);

    const ledger = await enforcer.getLedger(taskId);
    expect(ledger).toHaveLength(WORK_PROCESS_PHASES.length);
    assertLedgerCompleteness(ledger);
    expect(ledger[0].previousHash).toBeNull();
    expect(ledger[1].previousHash).toBe(ledger[0].hash);
  });

  it('requires orderly transitions and handles backtracks', async () => {
    const enforcer = WorkProcessEnforcer.createInMemory(makeClock());
    const taskId = 'T-002';

    await enforcer.recordTransition({ taskId, phase: 'strategize', actorId: 'agent', evidencePath: 'e/strategize.md' });
    await expect(
      enforcer.recordTransition({ taskId, phase: 'implement', actorId: 'agent', evidencePath: 'e/implement.md' }),
    ).rejects.toThrow(/Expected spec/);

    await enforcer.recordTransition({ taskId, phase: 'spec', actorId: 'agent', evidencePath: 'e/spec.md' });
    await enforcer.recordTransition({ taskId, phase: 'plan', actorId: 'agent', evidencePath: 'e/plan.md' });
    await enforcer.recordTransition({ taskId, phase: 'think', actorId: 'agent', evidencePath: 'e/think.md' });

    await enforcer.requestBacktrack({
      taskId,
      targetPhase: 'spec',
      reason: 'Evidence gap',
      actorId: 'agent',
      evidencePath: 'e/backtrack.md',
    });

    await expect(
      enforcer.recordTransition({ taskId, phase: 'plan', actorId: 'agent', evidencePath: 'e/new-plan.md' }),
    ).rejects.toThrow(/backtracking to spec/);

    await enforcer.recordTransition({
      taskId,
      phase: 'spec',
      actorId: 'agent',
      evidencePath: 'e/spec-v2.md',
    });

    const ledger = await enforcer.getLedger(taskId);
    expect(ledger.at(-1)?.phase).toBe('spec');
    expect(ledger.filter((entry) => entry.backtrack)).toHaveLength(1);
  });
});
