import { describe, expect, it } from 'vitest';

import type { Task } from '../task_executor.js';
import type {
  ProofResult,
  ProofCriteria,
  Discovery,
  TaskWithPhases,
  TaskPhase,
} from '../../prove/types.js';
import { ProofIntegration } from '../../prove/wave0_integration.js';

class FakeProofSystem {
  private result: ProofResult;

  constructor(result: ProofResult) {
    this.result = result;
  }

  async attemptProof(): Promise<ProofResult> {
    return this.result;
  }
}

const defaultCriteria: ProofCriteria = {
  build: true,
  test: true,
  runtime: [],
  integration: [],
  manual: [],
};

const baseProofResult = (): ProofResult => ({
  status: 'proven',
  timestamp: new Date().toISOString(),
  criteria: defaultCriteria,
  checks: [],
  discoveries: [],
  executionTimeMs: 100,
});

const createTask = (): Task & TaskWithPhases => ({
  id: 'AFP-PROOF',
  title: 'Proof validation task',
  status: 'pending',
  phases: [],
});

describe('ProofIntegration', () => {
  it('returns proven when proof system succeeds', async () => {
    const task = createTask();
    const proofSystem = new FakeProofSystem(baseProofResult());

    const integration = new ProofIntegration(
      process.cwd(),
      'wave0-session-test',
      { proofSystem: proofSystem as any }
    );

    const status = await integration.processTaskAfterExecution(task, 'completed');
    expect(status).toBe('proven');
    expect(task.phases?.some((phase: TaskPhase) => phase.status === 'complete')).toBe(true);
  });

  it('returns discovering when proof finds issues', async () => {
    const discoveries: Discovery[] = [
      {
        id: 'disc-1',
        title: 'Build failed',
        description: 'Build check failed',
        severity: 'critical',
        context: { error: 'npm run build exited 1' },
      },
    ];

    const task = createTask();
    const proofSystem = new FakeProofSystem({
      ...baseProofResult(),
      status: 'unproven',
      discoveries,
    });

    const integration = new ProofIntegration(
      process.cwd(),
      'wave0-session-test',
      { proofSystem: proofSystem as any }
    );

    const status = await integration.processTaskAfterExecution(task, 'completed');
    expect(status).toBe('discovering');
    const improvementPhase = task.phases?.find((phase) => phase.type === 'improvement');
    expect(improvementPhase).toBeDefined();
  });

  it('marks task blocked when execution fails before proof', async () => {
    const task = createTask();
    const proofSystem = new FakeProofSystem(baseProofResult());

    const integration = new ProofIntegration(
      process.cwd(),
      'wave0-session-test',
      { proofSystem: proofSystem as any }
    );

    const status = await integration.processTaskAfterExecution(task, 'failed');
    expect(status).toBe('blocked');
  });
});
