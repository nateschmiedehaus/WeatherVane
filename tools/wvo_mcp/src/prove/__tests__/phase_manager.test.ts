import { describe, expect, it } from 'vitest';

import { PhaseManager } from '../phase_manager.js';
import type { TaskWithPhases, Discovery } from '../types.js';

describe('PhaseManager', () => {
  it('creates initial phases for a task', () => {
    const manager = new PhaseManager();
    const phases = manager.createInitialPhases('AFP-TEST');

    expect(phases).toHaveLength(3);
    expect(phases.map((phase) => phase.type)).toEqual([
      'implementation',
      'discovery',
      'verification',
    ]);
  });

  it('completes discovery phase and generates improvement phases', async () => {
    const manager = new PhaseManager();
    const task: TaskWithPhases = {
      id: 'AFP-TEST',
      title: 'Proof loop validation',
      status: 'pending',
      phases: manager.createInitialPhases('AFP-TEST'),
    };

    const discoveries: Discovery[] = [
      {
        id: 'disc-1',
        title: 'Missing verify.md',
        description: 'Proof failed to generate evidence',
        severity: 'high',
        context: { error: 'File not found' },
      },
    ];

    await manager.completePhase(task, 'AFP-TEST.discovery', {
      outcome: 'discovery',
      message: 'Found issues',
      discoveries,
    });

    expect(task.phases).toBeDefined();
    const phases = task.phases!;
    expect(phases).toHaveLength(4);
    const improvement = phases.find((phase) => phase.type === 'improvement');
    expect(improvement).toBeDefined();
    expect(task.stats?.iterationCount).toBe(1);
  });
});
