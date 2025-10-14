import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StateMachine } from '../orchestrator/state_machine.js';

describe('StateMachine correlation IDs', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(path.join(tmpdir(), 'wvo-state-machine-'));
    stateMachine = new StateMachine(workspaceRoot);
  });

  afterEach(() => {
    stateMachine.close();
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('propagates correlation IDs through transitions and updates', async () => {
    const baseCorrelation = 'test-sync';
    stateMachine.createTask(
      {
        id: 'T-correlation',
        title: 'Initial Task',
        type: 'task',
        status: 'pending',
      },
      `${baseCorrelation}:create`,
    );

    await stateMachine.transition(
      'T-correlation',
      'in_progress',
      undefined,
      `${baseCorrelation}:status`,
    );

    stateMachine.updateTaskDetails(
      'T-correlation',
      { title: 'Updated Title' },
      `${baseCorrelation}:details`,
    );

    const events = stateMachine.getEvents({ taskId: 'T-correlation' });
    const transitionEvent = events.find((event) => event.event_type === 'task_transition');
    const updateEvent = events.find((event) => event.event_type === 'task_updated');

    expect(transitionEvent?.correlation_id).toBe(`${baseCorrelation}:status`);
    expect(updateEvent?.correlation_id).toBe(`${baseCorrelation}:details`);
  });

  it('automatically unblocks dependents when blocking tasks complete', async () => {
    stateMachine.createTask(
      {
        id: 'T-root',
        title: 'Root task',
        type: 'task',
        status: 'in_progress',
      },
      'deps-test:create:root',
    );

    stateMachine.createTask(
      {
        id: 'T-dependent',
        title: 'Follow-up task',
        type: 'task',
        status: 'blocked',
      },
      'deps-test:create:dependent',
    );

    stateMachine.addDependency('T-dependent', 'T-root', 'blocks');

    await stateMachine.transition('T-root', 'done', undefined, 'deps-test:complete');

    const dependent = stateMachine.getTask('T-dependent');
    expect(dependent?.status).toBe('pending');

    const dependentEvents = stateMachine.getEvents({ taskId: 'T-dependent' });
    const unblockTransition = dependentEvents.find(
      (event) =>
        event.event_type === 'task_transition' &&
        event.data.to === 'pending',
    );
    expect(unblockTransition?.correlation_id?.startsWith('deps-test:complete:dependents')).toBe(true);

    await stateMachine.transition('T-root', 'in_progress', undefined, 'deps-test:reopen');

    const dependentAfterReopen = stateMachine.getTask('T-dependent');
    expect(dependentAfterReopen?.status).toBe('blocked');
    expect(dependentAfterReopen?.metadata).toMatchObject({
      auto_reblocked: true,
      auto_reblocked_by: 'T-root',
    });

    const eventsAfterReopen = stateMachine.getEvents({ taskId: 'T-dependent' });
    const reblockEvent = eventsAfterReopen.find(
      (event) =>
        event.event_type === 'task_transition' &&
        event.data.to === 'blocked',
    );
    expect(reblockEvent?.correlation_id?.startsWith('deps-test:reopen:dependents')).toBe(true);
  });

  it('removes metadata keys when transition patch sets them to null', async () => {
    stateMachine.createTask(
      {
        id: 'T-meta',
        title: 'Meta-blocked task',
        type: 'task',
        status: 'blocked',
        metadata: {
          blocked_by_meta_work: true,
          blocking_phases: ['PHASE-4-POLISH'],
        },
      },
      'meta:test',
    );

    await stateMachine.transition(
      'T-meta',
      'pending',
      {
        blocked_by_meta_work: null,
        blocking_phases: null,
      },
      'meta:test:clear',
    );

    const task = stateMachine.getTask('T-meta');
    expect(task?.status).toBe('pending');
    expect(task?.metadata ?? {}).not.toHaveProperty('blocked_by_meta_work');
    expect(task?.metadata ?? {}).not.toHaveProperty('blocking_phases');
  });
});
