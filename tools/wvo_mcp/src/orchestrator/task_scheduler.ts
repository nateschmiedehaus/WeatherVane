import { EventEmitter } from 'node:events';

import type { Task, TaskStatus } from './state_machine.js';
import type { StateMachine } from './state_machine.js';

type ResourceProfile = 'light' | 'standard' | 'heavy';

export interface TaskSchedulerOptions {
  heavyTaskLimit?: number;
  researchSignalsEnabled?: boolean;
  researchSensitivity?: number;
  researchSignalCooldownMs?: number;
}

export type SchedulingReason =
  | 'requires_review'
  | 'requires_follow_up'
  | 'dependencies_cleared';

export interface BatchInfo {
  groupKey: SchedulingReason;
  groupLabel: string;
  position: number;
  size: number;
}

export interface ScheduledTask {
  task: Task;
  priority: number;
  reason: SchedulingReason;
  batch?: BatchInfo;
  resourceProfile?: ResourceProfile;
}

export type ResearchTriggerType =
  | 'explicit-request'
  | 'failure-recovery'
  | 'complexity'
  | 'strategic-decision';

export interface ResearchTriggerPayload {
  taskId: string;
  taskTitle: string;
  reason: SchedulingReason;
  triggerType: ResearchTriggerType;
  confidence: number;
  hints: string[];
}

export interface QueueMetrics {
  updatedAt: number;
  size: number;
  reasonCounts: Record<SchedulingReason, number>;
  heads: Record<
    SchedulingReason,
    Array<{ id: string; title: string; priority: number }>
  >;
  resource: {
    heavyTaskLimit: number;
    activeHeavyTasks: number;
    queuedHeavyTasks: number;
  };
}

export interface PriorityProfile {
  statusWeights?: Partial<Record<TaskStatus, number>>;
  complexityBias?: number;
  stalenessBias?: number;
}

interface QueueCandidate {
  task: Task;
  reason: SchedulingReason;
  priority: number;
  resourceProfile: ResourceProfile;
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
  private queueMetrics: QueueMetrics = {
    updatedAt: Date.now(),
    size: 0,
    reasonCounts: {
      requires_review: 0,
      requires_follow_up: 0,
      dependencies_cleared: 0,
    },
    heads: {
      requires_review: [],
      requires_follow_up: [],
      dependencies_cleared: [],
    },
    resource: {
      heavyTaskLimit: 1,
      activeHeavyTasks: 0,
      queuedHeavyTasks: 0,
    },
  };
  private priorityProfile: ResolvedPriorityProfile = {
    statusWeights: { ...DEFAULT_STATUS_WEIGHTS },
    complexityBias: DEFAULT_PRIORITY_PROFILE.complexityBias,
    stalenessBias: DEFAULT_PRIORITY_PROFILE.stalenessBias,
  };
  private readonly taskProfiles = new Map<string, ResourceProfile>();
  private activeHeavyTasks = 0;
  private resourceLimits = {
    heavyTaskLimit: 1,
  };
  private researchSignalsEnabled: boolean;
  private researchSensitivity: number;
  private researchSignalCooldownMs: number;
  private readonly researchSignalHistory = new Map<string, number>();

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

  constructor(private readonly stateMachine: StateMachine, options: TaskSchedulerOptions = {}) {
    super();
    this.stateMachine.on('task:created', this.onStateChange);
    this.stateMachine.on('task:transition', this.onTaskTransition);
    this.stateMachine.on('task:completed', this.onStateChange);

    this.setResourceLimits({ heavyTaskLimit: options.heavyTaskLimit });
    this.researchSignalsEnabled = options.researchSignalsEnabled ?? false;
    this.researchSensitivity = this.normalizeSensitivity(options.researchSensitivity);
    this.researchSignalCooldownMs = this.normalizeCooldown(options.researchSignalCooldownMs);
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

  setResearchConfig(config: { enabled?: boolean; sensitivity?: number; cooldownMs?: number }): void {
    const previousEnabled = this.researchSignalsEnabled;
    const previousSensitivity = this.researchSensitivity;
    const previousCooldown = this.researchSignalCooldownMs;

    if (typeof config.enabled === 'boolean') {
      this.researchSignalsEnabled = config.enabled;
    }
    if (typeof config.sensitivity === 'number' && Number.isFinite(config.sensitivity)) {
      this.researchSensitivity = this.normalizeSensitivity(config.sensitivity);
    }
    if (typeof config.cooldownMs === 'number' && Number.isFinite(config.cooldownMs)) {
      this.researchSignalCooldownMs = this.normalizeCooldown(config.cooldownMs);
    }

    if (
      previousEnabled !== this.researchSignalsEnabled ||
      previousSensitivity !== this.researchSensitivity ||
      previousCooldown !== this.researchSignalCooldownMs
    ) {
      if (!this.researchSignalsEnabled) {
        this.researchSignalHistory.clear();
      }
      this.emit('research:config', {
        enabled: this.researchSignalsEnabled,
        sensitivity: this.researchSensitivity,
        cooldownMs: this.researchSignalCooldownMs,
      });
    }
  }

  /**
   * Fetch the next task ready for execution and mark it busy.
   */
  takeNextTask(): ScheduledTask | undefined {
    if (this.queue.length === 0) {
      this.refreshQueue();
    }

    const deferred: ScheduledTask[] = [];
    let next: ScheduledTask | undefined;
    while (this.queue.length > 0) {
      const candidate = this.queue.shift()!;
      const profile = candidate.resourceProfile ?? this.classifyResourceProfile(candidate.task);
      candidate.resourceProfile = profile;
      this.taskProfiles.set(candidate.task.id, profile);

      if (profile === 'heavy' && this.activeHeavyTasks >= this.resourceLimits.heavyTaskLimit) {
        deferred.push(candidate);
        continue;
      }

      if (profile === 'heavy') {
        this.activeHeavyTasks += 1;
      }

      next = candidate;
      break;
    }

    if (deferred.length > 0) {
      this.queue = deferred.concat(this.queue);
    }

    if (!next) {
      this.queueMetrics.resource.activeHeavyTasks = this.activeHeavyTasks;
      return undefined;
    }

    this.busyTasks.add(next.task.id);
    this.emit('task:scheduled', { taskId: next.task.id, reason: next.reason });
    this.queueMetrics.resource.activeHeavyTasks = this.activeHeavyTasks;
    return next;
  }

  /**
   * Release a task that could not be executed so it can be scheduled again.
   */
  releaseTask(taskId: string): void {
    if (this.busyTasks.delete(taskId)) {
      this.adjustHeavyTaskCount(taskId, -1);
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
    this.adjustHeavyTaskCount(taskId, -1, true);
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

  getQueueMetrics(): QueueMetrics {
    return { ...this.queueMetrics };
  }

  setResourceLimits(limits: TaskSchedulerOptions): void {
    if (typeof limits.heavyTaskLimit === 'number') {
      const normalized = this.normalizeHeavyTaskLimit(limits.heavyTaskLimit);
      if (normalized !== this.resourceLimits.heavyTaskLimit) {
        this.resourceLimits.heavyTaskLimit = normalized;
        this.queueMetrics.resource.heavyTaskLimit = normalized;
        if (this.activeHeavyTasks > normalized) {
          this.activeHeavyTasks = normalized;
          this.queueMetrics.resource.activeHeavyTasks = this.activeHeavyTasks;
        }
        this.refreshQueue();
      }
    }
  }

  private normalizeHeavyTaskLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) {
      return 1;
    }
    return Math.max(1, Math.floor(limit));
  }

  private refreshQueue(): void {
    const candidates: QueueCandidate[] = [];
    const seen = new Set<string>();
    const reasonCounts: Record<SchedulingReason, number> = {
      requires_review: 0,
      requires_follow_up: 0,
      dependencies_cleared: 0,
    };

    const pushCandidate = (task: Task, baseReason: SchedulingReason) => {
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
      reasonCounts[baseReason] += 1;
      const resourceProfile = this.classifyResourceProfile(task);
      this.taskProfiles.set(task.id, resourceProfile);
      candidates.push({
        task,
        priority,
        reason: baseReason,
        resourceProfile,
      });
      this.evaluateResearchSignals(task, baseReason);
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
    const reasonLabels: Record<SchedulingReason, string> = {
      requires_review: 'Review queue',
      requires_follow_up: 'Fix-up queue',
      dependencies_cleared: 'Ready queue',
    };

    const batchGroups = new Map<SchedulingReason, Array<number>>();
    const queueWithBatch = candidates.map((candidate, index) => {
      const indices = batchGroups.get(candidate.reason);
      if (indices) {
        indices.push(index);
      } else {
        batchGroups.set(candidate.reason, [index]);
      }
      return {
        task: candidate.task,
        priority: candidate.priority,
        reason: candidate.reason,
        resourceProfile: candidate.resourceProfile,
      } as ScheduledTask;
    });

    for (const [reason, indices] of batchGroups.entries()) {
      const size = indices.length;
      indices.forEach((indexPosition, offset) => {
        if (size > 1) {
          const batch: BatchInfo = {
            groupKey: reason,
            groupLabel: reasonLabels[reason],
            position: offset + 1,
            size,
          };
          queueWithBatch[indexPosition] = {
            ...queueWithBatch[indexPosition],
            batch,
          };
        }
      });
    }

    this.queue = queueWithBatch;

    const heads: QueueMetrics['heads'] = {
      requires_review: [],
      requires_follow_up: [],
      dependencies_cleared: [],
    };

    for (const scheduled of this.queue) {
      const bucket = heads[scheduled.reason];
      if (bucket.length < 3) {
        bucket.push({
          id: scheduled.task.id,
          title: scheduled.task.title,
          priority: scheduled.priority,
        });
      }
    }

    const queuedHeavyTasks = this.queue.filter((entry) => (entry.resourceProfile ?? 'standard') === 'heavy').length;

    this.queueMetrics = {
      updatedAt: Date.now(),
      size: this.queue.length,
      reasonCounts,
      heads,
      resource: {
        heavyTaskLimit: this.resourceLimits.heavyTaskLimit,
        activeHeavyTasks: this.activeHeavyTasks,
        queuedHeavyTasks,
      },
    };

    this.emit('queue:updated', { size: this.queue.length });
  }

  private evaluateResearchSignals(task: Task, reason: SchedulingReason): void {
    if (!this.researchSignalsEnabled) {
      return;
    }
    const resolved = this.resolveResearchTrigger(task, reason);
    if (!resolved) {
      return;
    }
    const now = Date.now();
    const lastSignalAt = this.researchSignalHistory.get(task.id);
    if (lastSignalAt && now - lastSignalAt < this.researchSignalCooldownMs) {
      return;
    }
    this.researchSignalHistory.set(task.id, now);
    this.emit('research:trigger', {
      taskId: task.id,
      taskTitle: task.title,
      reason,
      triggerType: resolved.type,
      confidence: resolved.confidence,
      hints: resolved.hints,
    } satisfies ResearchTriggerPayload);
  }

  private resolveResearchTrigger(
    task: Task,
    reason: SchedulingReason,
  ): { type: ResearchTriggerType; confidence: number; hints: string[] } | null {
    const heuristics: Array<{ type: ResearchTriggerType; score: number; hint: string }> = [];
    const text = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();

    if (/\bresearch\b|\binvestigat|\bbest practice|\bbenchmark/.test(text)) {
      heuristics.push({
        type: 'explicit-request',
        score: 0.95,
        hint: 'Task explicitly mentions research keywords',
      });
    }

    const strategicMatch = /\barchitect|\bdesign|\bframework|\bsystem\b/.test(text);
    if (strategicMatch) {
      heuristics.push({
        type: 'strategic-decision',
        score: 0.75,
        hint: 'Task appears architecturally significant',
      });
    }

    const complexity = task.estimated_complexity ?? 0;
    if (complexity >= 8) {
      heuristics.push({
        type: 'complexity',
        score: Math.min(0.9, 0.6 + (complexity - 7) * 0.05),
        hint: `High complexity rating (${complexity})`,
      });
    }

    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    const failureCount = ['failure_count', 'retry_count', 'attempts', 'failures']
      .map((key) => {
        const value = metadata[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      })
      .find((value): value is number => typeof value === 'number');

    if (typeof failureCount === 'number' && failureCount >= 2) {
      heuristics.push({
        type: 'failure-recovery',
        score: Math.min(0.9, 0.6 + Math.min(failureCount, 5) * 0.05),
        hint: `Repeated failures (${failureCount})`,
      });
    } else if (reason === 'requires_follow_up') {
      heuristics.push({
        type: 'failure-recovery',
        score: 0.65,
        hint: 'Task requires follow-up, indicating prior failure',
      });
    }

    if (heuristics.length === 0) {
      return null;
    }

    heuristics.sort((a, b) => b.score - a.score);
    const top = heuristics[0];
    if (top.score < this.researchSensitivity) {
      return null;
    }

    const hints = heuristics
      .filter((entry) => entry.score >= this.researchSensitivity - 0.1)
      .map((entry) => entry.hint);

    return {
      type: top.type,
      confidence: Math.min(0.99, Math.max(this.researchSensitivity, top.score)),
      hints,
    };
  }

  private normalizeSensitivity(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0.5;
    }
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return Math.round(value * 100) / 100;
  }

  private normalizeCooldown(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return 5 * 60 * 1000;
    }
    return Math.max(60_000, Math.floor(value));
  }

  private classifyResourceProfile(task: Task): ResourceProfile {
    const metadataProfile = this.extractMetadataProfile(task.metadata);
    if (metadataProfile) {
      return metadataProfile;
    }

    const complexity = task.estimated_complexity ?? 5;
    if (complexity >= 8) {
      return 'heavy';
    }
    if (complexity <= 3) {
      return 'light';
    }

    const normalizedTitle = task.title.toLowerCase();
    if (this.containsHeavyKeyword(normalizedTitle)) {
      return 'heavy';
    }
    if (this.containsLightKeyword(normalizedTitle)) {
      return 'light';
    }
    return 'standard';
  }

  private extractMetadataProfile(metadata: unknown): ResourceProfile | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const record = metadata as Record<string, unknown>;
    const candidate =
      record['resource_profile'] ??
      record['resourceProfile'] ??
      record['workload'] ??
      record['workload_type'];
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (normalized === 'heavy' || normalized === 'standard' || normalized === 'light') {
        return normalized;
      }
      if (normalized.includes('heavy')) {
        return 'heavy';
      }
      if (normalized.includes('light')) {
        return 'light';
      }
    }

    const expectedRuntime = record['expected_runtime_minutes'];
    if (typeof expectedRuntime === 'number' && Number.isFinite(expectedRuntime)) {
      if (expectedRuntime >= 30) {
        return 'heavy';
      }
      if (expectedRuntime <= 5) {
        return 'light';
      }
    }

    return null;
  }

  private containsHeavyKeyword(title: string): boolean {
    const HEAVY_KEYWORDS = [
      'retrain',
      'calibration',
      'ingest',
      'backfill',
      'benchmark',
      'load test',
      'stress',
      'integration',
      'smoke',
      'heavy',
      'bulk',
      'full run',
    ];
    return HEAVY_KEYWORDS.some((keyword) => title.includes(keyword));
  }

  private containsLightKeyword(title: string): boolean {
    const LIGHT_KEYWORDS = ['docs', 'documentation', 'note', 'summary', 'guardrail', 'lint'];
    return LIGHT_KEYWORDS.some((keyword) => title.includes(keyword));
  }

  private adjustHeavyTaskCount(taskId: string, delta: number, removeProfile = false): void {
    const profile = this.taskProfiles.get(taskId);
    if (profile === 'heavy') {
      this.activeHeavyTasks = Math.max(0, this.activeHeavyTasks + delta);
      this.queueMetrics.resource.activeHeavyTasks = this.activeHeavyTasks;
    }
    if (removeProfile) {
      this.taskProfiles.delete(taskId);
    }
  }
}
