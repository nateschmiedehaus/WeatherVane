import { EventEmitter } from 'node:events';
import { describe, expect, it, beforeEach } from 'vitest';

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

  // Unused by TaskScheduler in this test but required for typing
  // eslint-disable-next-line class-methods-use-this
  getTask(): Task | null {
    return null;
  }
}

function createTask(id: string, status: TaskStatus, createdAtOffset = 0, type: TaskType = 'task'): Task {
  return {
    id,
    title: `${id} title`,
    type,
    status,
    created_at: Date.now() - createdAtOffset,
    estimated_complexity: 5,
  };
}

describe('TaskScheduler batch queue', () => {
  let stub: StubStateMachine;
  let scheduler: TaskScheduler;

  beforeEach(() => {
    stub = new StubStateMachine({
      review: [createTask('R1', 'needs_review'), createTask('R2', 'needs_review', 10)],
      fixup: [createTask('F1', 'needs_improvement')],
      ready: [createTask('P1', 'pending', 20)],
    });

    scheduler = new TaskScheduler(stub as unknown as StateMachine);
  });

  it('groups similar reasons into batches and exposes queue metrics', () => {
    const metrics = scheduler.getQueueMetrics();
    expect(metrics.reasonCounts.requires_review).toBe(2);
    expect(metrics.reasonCounts.requires_follow_up).toBe(1);
    expect(metrics.reasonCounts.dependencies_cleared).toBe(1);
    const reviewHeads = metrics.heads.requires_review.map((entry) => entry.id);
    expect(reviewHeads).toHaveLength(2);
    expect(reviewHeads).toEqual(expect.arrayContaining(['R1', 'R2']));

    const first = scheduler.takeNextTask();
    expect(['R1', 'R2']).toContain(first?.task.id);
    expect(first?.batch).toBeDefined();
    expect(first?.batch?.size).toBe(2);
    expect(first?.batch?.position).toBe(1);
    expect(first?.reason).toBe('requires_review');

    const second = scheduler.takeNextTask();
    expect(['R1', 'R2']).toContain(second?.task.id);
    expect(second?.task.id).not.toBe(first?.task.id);
    expect(second?.batch).toBeDefined();
    expect(second?.batch?.size).toBe(2);
    expect(second?.batch?.position).toBe(2);
  });

  it('updates metrics after releasing tasks back into the queue', () => {
    const first = scheduler.takeNextTask();
    expect(['R1', 'R2']).toContain(first?.task.id);

    scheduler.releaseTask(first!.task.id);

    const metrics = scheduler.getQueueMetrics();
    expect(metrics.reasonCounts.requires_review).toBeGreaterThanOrEqual(1);
    expect(metrics.heads.requires_review[0]?.id).toBeDefined();
  });
});
