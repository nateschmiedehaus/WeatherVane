import { EventEmitter } from 'node:events';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { HolisticReviewManager, type HolisticReviewConfig } from './holistic_review_manager.js';
import type { ContextEntry, StateMachine, Task, TaskStatus } from './state_machine.js';

class MockStateMachine extends EventEmitter {
  readonly tasks: Task[] = [];
  readonly contextEntries: ContextEntry[] = [];

  createTask(task: Omit<Task, 'created_at'>): Task {
    const fullTask: Task = {
      ...task,
      created_at: Date.now(),
    };
    this.tasks.push(fullTask);
    this.emit('task:created', fullTask);
    return fullTask;
  }

  addContextEntry(entry: Omit<ContextEntry, 'id' | 'timestamp'>): ContextEntry {
    const context: ContextEntry = {
      id: this.contextEntries.length + 1,
      timestamp: Date.now(),
      ...entry,
    };
    this.contextEntries.push(context);
    return context;
  }

  getTasks(): Task[] {
    return [...this.tasks];
  }
}

function createTaskEvent(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: overrides.title ?? `Task ${id}`,
    description: overrides.description,
    type: overrides.type ?? 'task',
    status: overrides.status ?? 'done',
    assigned_to: overrides.assigned_to,
    epic_id: overrides.epic_id,
    parent_id: overrides.parent_id,
    created_at: overrides.created_at ?? Date.now(),
    started_at: overrides.started_at,
    completed_at: overrides.completed_at,
    estimated_complexity: overrides.estimated_complexity,
    actual_duration_seconds: overrides.actual_duration_seconds,
    metadata: overrides.metadata,
  };
}

describe('HolisticReviewManager', () => {
  const baseConfig: Partial<HolisticReviewConfig> = {
    minTasksPerGroup: 2,
    maxTasksTracked: 5,
    maxGroupIntervalMs: Number.MAX_SAFE_INTEGER,
    globalIntervalMs: Number.MAX_SAFE_INTEGER,
    globalMinTasks: Number.MAX_SAFE_INTEGER,
    dryRun: false,
  };

  let stateMachine: MockStateMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    stateMachine = new MockStateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules holistic reviews when group thresholds are met', () => {
    const manager = new HolisticReviewManager(stateMachine as unknown as StateMachine, baseConfig);
    manager.start();

    const first = createTaskEvent('task-1', { epic_id: 'EP-42' });
    stateMachine.emit('task:completed', first);

    expect(stateMachine.tasks).toHaveLength(0);

    vi.advanceTimersByTime(10);

    const second = createTaskEvent('task-2', { epic_id: 'EP-42' });
    stateMachine.emit('task:completed', second);

    expect(stateMachine.tasks).toHaveLength(1);

    const reviewTask = stateMachine.tasks[0];
    expect(reviewTask.title).toContain('Holistic review');
    const metadata = reviewTask.metadata as Record<string, any>;
    expect(metadata?.review_kind).toBe('holistic');
    const requestedActions = metadata?.requested_actions as
      | { create_remediation_tasks?: boolean; fix_issues_immediately?: boolean }
      | undefined;
    expect(requestedActions?.create_remediation_tasks).toBe(true);
    expect(stateMachine.contextEntries[0]?.topic).toBe('holistic_review');

    const status = manager.getStatus();
    expect(status.activeReviews).toHaveLength(1);
    expect(status.activeReviews[0]?.pending).toBe(true);

    manager.stop();
  });

  it('clears pending review state after completion', () => {
    const manager = new HolisticReviewManager(stateMachine as unknown as StateMachine, baseConfig);
    manager.start();

    const tasks = ['task-a', 'task-b'].map((id) =>
      createTaskEvent(id, { epic_id: 'EP-77' }),
    );

    for (const task of tasks) {
      stateMachine.emit('task:completed', task);
      vi.advanceTimersByTime(5);
    }

    const reviewTask = stateMachine.tasks[0];
    expect(reviewTask).toBeDefined();

    const statusBefore = manager.getStatus();
    expect(statusBefore.activeReviews).toHaveLength(1);

    stateMachine.emit(
      'task:transition',
      reviewTask,
      'pending' as TaskStatus,
      'done' as TaskStatus,
    );

    const statusAfter = manager.getStatus();
    expect(statusAfter.activeReviews).toHaveLength(0);

    manager.stop();
  });

  it('skips task creation in dry-run mode', () => {
    const dryRunManager = new HolisticReviewManager(stateMachine as unknown as StateMachine, {
      ...baseConfig,
      minTasksPerGroup: 1,
      dryRun: true,
    });
    dryRunManager.start();

    const dryTask = createTaskEvent('dry-task-1', { epic_id: 'EP-DRY' });
    stateMachine.emit('task:completed', dryTask);

    expect(stateMachine.tasks).toHaveLength(0);
    expect(dryRunManager.getStatus().activeReviews).toHaveLength(0);

    dryRunManager.stop();
  });
});
