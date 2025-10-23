import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it } from 'vitest';

import { TaskScheduler } from '../orchestrator/task_scheduler.js';
import type { Task, TaskStatus, TaskType, StateMachine } from '../orchestrator/state_machine.js';

type SchedulerQueues = {
  review: Task[];
  fixup: Task[];
  ready: Task[];
};

class StubStateMachine extends EventEmitter {
  private queues: SchedulerQueues;

  constructor(initial: SchedulerQueues) {
    super();
    this.queues = initial;
  }

  updateQueues(next: SchedulerQueues) {
    this.queues = next;
    this.emit('task:created');
  }

  getTasksForScheduling(): SchedulerQueues {
    return this.queues;
  }

  // Unused but required for typing compatibility
  // eslint-disable-next-line class-methods-use-this
  getTask(): Task | null {
    return null;
  }
}

function createTask(
  id: string,
  status: TaskStatus,
  resourceProfile: 'heavy' | 'standard' | 'light',
  createdAtOffset = 0,
  type: TaskType = 'task',
): Task {
  return {
    id,
    title: `${id} title`,
    type,
    status,
    created_at: Date.now() - createdAtOffset,
    estimated_complexity: 5,
    metadata: resourceProfile === 'standard' ? undefined : { resource_profile: resourceProfile },
  };
}

describe('TaskScheduler resource-aware heavy gating', () => {
  let stub: StubStateMachine;
  let scheduler: TaskScheduler;

  beforeEach(() => {
    stub = new StubStateMachine({
      review: [],
      fixup: [],
      ready: [
        createTask('H1', 'pending', 'heavy', 30),
        createTask('H2', 'pending', 'heavy', 20),
        createTask('L1', 'pending', 'light', 0),
      ],
    });

    scheduler = new TaskScheduler(stub as unknown as StateMachine, { heavyTaskLimit: 1 });
  });

  it('defers additional heavy tasks when the configured limit is reached', () => {
    const metrics = scheduler.getQueueMetrics();
    expect(metrics.resource.heavyTaskLimit).toBe(1);
    expect(metrics.resource.queuedHeavyTasks).toBe(2);

    const first = scheduler.takeNextTask();
    expect(first?.task.id).toBe('H1');
    expect(first?.resourceProfile).toBe('heavy');

    const second = scheduler.takeNextTask();
    expect(second?.task.id).toBe('L1');
    expect(second?.resourceProfile).toBe('light');

    scheduler.releaseTask(first!.task.id);

    const third = scheduler.takeNextTask();
    expect(['H1', 'H2']).toContain(third?.task.id);
    expect(third?.resourceProfile).toBe('heavy');
  });
});
