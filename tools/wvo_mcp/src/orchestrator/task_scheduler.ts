import { EventEmitter } from 'node:events';

import type { Task, TaskStatus } from './state_machine.js';
import type { StateMachine } from './state_machine.js';

export interface ScheduledTask {
  task: Task;
  priority: number;
  reason: string;
}

export interface PriorityProfile {
  statusWeights?: Partial<Record<TaskStatus, number>>;
  complexityBias?: number;
  stalenessBias?: number;
}

interface QueueCandidate {
  task: Task;
  reason: string;
  priority: number;
}

const DEFAULT_STATUS_WEIGHTS: Record<TaskStatus, number> = {
  needs_review: 105,
  needs_improvement: 95,
  pending: 60,
  in_progress: 0,
  blocked: -25,
  done: -40,
};

const DEFAULT_PRIORITY_PROFILE = {
  statusWeights: DEFAULT_STATUS_WEIGHTS,
  complexityBias: 1,
  stalenessBias: 1,
} as const;

type ResolvedPriorityProfile = {
  statusWeights: Record<TaskStatus, number>;
  complexityBias: number;
  stalenessBias: number;
};

/**
 * TaskScheduler maintains a priority queue of roadmap work that is ready to execute.
 * It listens to state transitions and keeps a cache of runnable tasks so the coordinator
 * can dispatch work quickly whenever an agent becomes available.
 */
export class TaskScheduler extends EventEmitter {
  private readonly busyTasks = new Set<string>();
  private readonly blockedTasks = new Set<string>();
  private queue: ScheduledTask[] = [];
  private priorityProfile: ResolvedPriorityProfile = {
    statusWeights: { ...DEFAULT_STATUS_WEIGHTS },
    complexityBias: DEFAULT_PRIORITY_PROFILE.complexityBias,
    stalenessBias: DEFAULT_PRIORITY_PROFILE.stalenessBias,
  };

  private readonly onStateChange = () => {
    this.refreshQueue();
  };

  private readonly onTaskTransition = (task: Task, _from: TaskStatus, to: TaskStatus) => {
    if (to === 'blocked') {
      this.blockedTasks.add(task.id);
    } else {
      this.blockedTasks.delete(task.id);
    }
    this.onStateChange();
  };

  constructor(private readonly stateMachine: StateMachine) {
    super();
    this.stateMachine.on('task:created', this.onStateChange);
    this.stateMachine.on('task:transition', this.onTaskTransition);
    this.stateMachine.on('task:completed', this.onStateChange);

    this.refreshQueue();
  }

  /**
   * Clean up event listeners to prevent memory leaks
   */
  destroy(): void {
    this.stateMachine.removeListener('task:created', this.onStateChange);
    this.stateMachine.removeListener('task:transition', this.onTaskTransition);
    this.stateMachine.removeListener('task:completed', this.onStateChange);
  }

  /**
   * Fetch the next task ready for execution and mark it busy.
   */
  takeNextTask(): ScheduledTask | undefined {
    if (this.queue.length === 0) {
      this.refreshQueue();
    }

    const next = this.queue.shift();
    if (!next) {
      return undefined;
    }

    this.busyTasks.add(next.task.id);
    this.emit('task:scheduled', { taskId: next.task.id, reason: next.reason });
    return next;
  }

  /**
   * Release a task that could not be executed so it can be scheduled again.
   */
  releaseTask(taskId: string): void {
    if (this.busyTasks.delete(taskId)) {
      this.emit('task:released', { taskId });
      this.refreshQueue();
    }
  }

  /**
   * Mark a task as fully handled so it disappears from the scheduler.
   */
  completeTask(taskId: string): void {
    if (this.busyTasks.delete(taskId)) {
      this.emit('task:completed', { taskId });
    }
    this.blockedTasks.delete(taskId);
    this.refreshQueue();
  }

  /**
   * Adjust the prioritisation strategy with dynamic weights.
   */
  setPriorityProfile(profile: PriorityProfile): void {
    const statusWeights = { ...DEFAULT_STATUS_WEIGHTS };
    if (profile.statusWeights) {
      for (const [status, weight] of Object.entries(profile.statusWeights)) {
        statusWeights[status as TaskStatus] = weight as number;
      }
    }

    this.priorityProfile = {
      statusWeights,
      complexityBias: profile.complexityBias ?? DEFAULT_PRIORITY_PROFILE.complexityBias,
      stalenessBias: profile.stalenessBias ?? DEFAULT_PRIORITY_PROFILE.stalenessBias,
    };

    this.refreshQueue();
  }

  getPriorityProfile(): ResolvedPriorityProfile {
    return {
      statusWeights: { ...this.priorityProfile.statusWeights },
      complexityBias: this.priorityProfile.complexityBias,
      stalenessBias: this.priorityProfile.stalenessBias,
    };
  }

  getQueueLength(): number {
    return this.queue.length;
  }


  private refreshQueue(): void {
    const candidates: QueueCandidate[] = [];
    const seen = new Set<string>();

    const pushCandidate = (task: Task, baseReason: string) => {
      if (!task) return;
      if (seen.has(task.id)) return;
      if (this.busyTasks.has(task.id)) return;
      if (this.blockedTasks.has(task.id)) return;
      if (task.status === 'done' || task.status === 'blocked') return;

      const statusWeight = this.priorityProfile.statusWeights[task.status] ?? 0;
      const complexity = task.estimated_complexity ?? 5;
      const complexityWeight = this.priorityProfile.complexityBias * (10 - complexity);
      const stalenessWeight = this.priorityProfile.stalenessBias * Math.min(
        10,
        Math.floor((Date.now() - task.created_at) / (1000 * 60 * 60 * 24)),
      );

      const reasonBoost =
        baseReason === 'requires_review'
          ? 5
          : baseReason === 'requires_follow_up'
          ? 3
          : 0;

      const priority = statusWeight + complexityWeight + stalenessWeight + reasonBoost;
      seen.add(task.id);
      candidates.push({
        task,
        priority,
        reason: baseReason,
      });
    };

    // Optimized: Get all scheduling tasks in a single query pass (was 3 separate queries)
    const { review, fixup, ready } = this.stateMachine.getTasksForScheduling();

    // Tasks requiring review should be handled first.
    for (const task of review) {
      pushCandidate(task, 'requires_review');
    }

    // Tasks needing improvement (fix-ups) are next.
    for (const task of fixup) {
      pushCandidate(task, 'requires_follow_up');
    }

    // Finally, any pending tasks whose dependencies are satisfied.
    for (const task of ready) {
      pushCandidate(task, 'dependencies_cleared');
    }

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.task.created_at - b.task.created_at;
    });

    this.queue = candidates.map((candidate) => ({
      task: candidate.task,
      priority: candidate.priority,
      reason: candidate.reason,
    }));

    this.emit('queue:updated', { size: this.queue.length });
  }
}
