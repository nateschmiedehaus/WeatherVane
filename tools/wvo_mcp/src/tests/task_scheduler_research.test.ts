import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskScheduler, type ResearchTriggerPayload } from '../orchestrator/task_scheduler.js';
import type { StateMachine, Task, TaskStatus, TaskType } from '../orchestrator/state_machine.js';

type SchedulerQueues = {
  review: Task[];
  fixup: Task[];
  ready: Task[];
};

class StubStateMachine extends EventEmitter {
  private queues: SchedulerQueues;

  constructor(initial?: SchedulerQueues) {
    super();
    this.queues =
      initial ?? {
        review: [],
        fixup: [],
        ready: [],
      };
  }

  updateQueues(next: SchedulerQueues): void {
    this.queues = next;
    this.emit('task:created');
  }

  getTasksForScheduling(): SchedulerQueues {
    return this.queues;
  }

  // Compatibility shim
  // eslint-disable-next-line class-methods-use-this
  getTask(): Task | null {
    return null;
  }
}

function createTask(
  id: string,
  overrides: Partial<Task> = {},
  status: TaskStatus = 'pending',
  type: TaskType = 'task',
): Task {
  return {
    id,
    title: overrides.title ?? `Task ${id}`,
    description: overrides.description,
    type: overrides.type ?? type,
    status: overrides.status ?? status,
    created_at: overrides.created_at ?? Date.now(),
    estimated_complexity: overrides.estimated_complexity ?? 5,
    metadata: overrides.metadata,
  };
}

describe('TaskScheduler research triggers', () => {
  let stubStateMachine: StubStateMachine;
  let scheduler: TaskScheduler;

  beforeEach(() => {
    stubStateMachine = new StubStateMachine();
    scheduler = new TaskScheduler(stubStateMachine as unknown as StateMachine, {
      researchSignalsEnabled: true,
      researchSensitivity: 0.5,
    });
  });

  afterEach(() => {
    scheduler.destroy();
  });

  it('emits research trigger for explicit research requests', async () => {
    const triggerPromise = new Promise<ResearchTriggerPayload>((resolve) => {
      scheduler.once('research:trigger', (payload: ResearchTriggerPayload) => {
        resolve(payload);
      });
    });

    stubStateMachine.updateQueues({
      review: [],
      fixup: [],
      ready: [
        createTask('task-1', {
          title: 'Investigate best practice for cache warmers',
          description: 'Need research into benchmark results before implementation.',
        }),
      ],
    });

    const payload = await triggerPromise;
    expect(payload.taskId).toBe('task-1');
    expect(payload.triggerType).toBe('explicit-request');
    expect(payload.hints).toContain('Task explicitly mentions research keywords');
  });

  it('respects sensitivity thresholds for lower-confidence triggers', async () => {
    const spy: ResearchTriggerPayload[] = [];
    scheduler.on('research:trigger', (payload: ResearchTriggerPayload) => {
      spy.push(payload);
    });

    scheduler.setResearchConfig({ sensitivity: 0.95 });

    stubStateMachine.updateQueues({
      review: [],
      fixup: [],
      ready: [
        createTask('task-2', {
          title: 'System architecture draft',
          description: 'Outline initial architecture approach',
          estimated_complexity: 7,
        }),
      ],
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(spy).toHaveLength(0);
  });

  it('detects repeated failure patterns based on metadata', async () => {
    const triggerPromise = new Promise<ResearchTriggerPayload>((resolve) => {
      scheduler.once('research:trigger', (payload: ResearchTriggerPayload) => resolve(payload));
    });

    stubStateMachine.updateQueues({
      review: [],
      fixup: [
        createTask('task-3', {
          title: 'Stabilize flaky integration tests',
          metadata: { failure_count: 3 },
        }),
      ],
      ready: [],
    });

    const payload = await triggerPromise;
    expect(payload.taskId).toBe('task-3');
    expect(payload.triggerType).toBe('failure-recovery');
    expect(payload.confidence).toBeGreaterThanOrEqual(0.6);
  });
});
