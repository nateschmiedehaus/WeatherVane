import { randomUUID } from 'node:crypto';

import { logInfo, logWarning } from '../telemetry/logger.js';

import type { Task, TaskStatus , StateMachine } from './state_machine.js';

export interface HolisticReviewConfig {
  minTasksPerGroup: number;
  maxGroupIntervalMs: number;
  maxTasksTracked: number;
  globalIntervalMs: number;
  globalMinTasks: number;
  dryRun: boolean;
}

interface GroupStats {
  recentTaskIds: string[];
  completedSinceReview: number;
  lastReviewAt: number;
  pendingReview: boolean;
}

interface ReviewContext {
  scope: 'group' | 'global';
  scopeId: string;
  scopeLabel: string;
  triggerReasons: string[];
  taskIds: string[];
  epicId?: string;
  parentId?: string;
}

interface ReviewMetadata extends Record<string, unknown> {
  review_kind: 'holistic';
  review_scope: string;
  review_scope_label: string;
  trigger_reasons: string[];
  recent_tasks: string[];
  requested_actions: {
    create_remediation_tasks: true;
    fix_issues_immediately: true;
  };
  generated_at: number;
}

export interface HolisticReviewStatus {
  config: HolisticReviewConfig;
  activeReviews: Array<{
    taskId: string;
    scope: string;
    pending: boolean;
    completedSinceReview: number;
    lastReviewAt: number;
  }>;
}

const GLOBAL_SCOPE_KEY = '__global__';

export class HolisticReviewManager {
  private readonly config: HolisticReviewConfig;
  private readonly groupStats = new Map<string, GroupStats>();
  private readonly reviewTaskIndex = new Map<string, string>(); // taskId -> scope key
  private started = false;

  private readonly onTaskCompleted = (task: Task) => {
    this.recordCompletion(task);
  };

  private readonly onTaskTransition = (task: Task, _from: TaskStatus, to: TaskStatus) => {
    this.observeReviewProgress(task, to);
  };

  constructor(
    private readonly stateMachine: StateMachine,
    config: Partial<HolisticReviewConfig> = {}
  ) {
    this.config = {
      minTasksPerGroup: config.minTasksPerGroup ?? 3,
      maxGroupIntervalMs: config.maxGroupIntervalMs ?? 45 * 60 * 1000, // 45 minutes
      maxTasksTracked: config.maxTasksTracked ?? 6,
      globalIntervalMs: config.globalIntervalMs ?? 90 * 60 * 1000, // 90 minutes
      globalMinTasks: config.globalMinTasks ?? 6,
      dryRun: config.dryRun ?? false,
    };
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.bootstrapExistingReviews();
    this.stateMachine.on('task:completed', this.onTaskCompleted);
    this.stateMachine.on('task:transition', this.onTaskTransition);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;

    this.stateMachine.removeListener('task:completed', this.onTaskCompleted);
    this.stateMachine.removeListener('task:transition', this.onTaskTransition);
    this.groupStats.clear();
    this.reviewTaskIndex.clear();
  }

  getStatus(): HolisticReviewStatus {
    return {
      config: { ...this.config },
      activeReviews: Array.from(this.reviewTaskIndex.entries()).map(([taskId, scopeKey]) => {
        const stats = this.groupStats.get(scopeKey);
        return {
          taskId,
          scope: scopeKey,
          pending: stats?.pendingReview ?? false,
          completedSinceReview: stats?.completedSinceReview ?? 0,
          lastReviewAt: stats?.lastReviewAt ?? 0,
        };
      }),
    };
  }

  private bootstrapExistingReviews(): void {
    const tasks = this.safeGetTasks();
    for (const task of tasks) {
      const metadata = this.extractReviewMetadata(task);
      if (metadata?.review_kind !== 'holistic') {
        continue;
      }

      const scopeKey = metadata.review_scope ?? GLOBAL_SCOPE_KEY;
      const stats = this.getStats(scopeKey);
      if (task.status !== 'done') {
        stats.pendingReview = true;
        this.reviewTaskIndex.set(task.id, scopeKey);
      }
      if (task.created_at) {
        stats.lastReviewAt = Math.max(stats.lastReviewAt, task.created_at);
      }
    }
  }

  private recordCompletion(task: Task): void {
    const epicId = task.epic_id ?? undefined;
    const parentId = task.parent_id ?? undefined;
    if (epicId) {
      this.evaluateScope({
        scope: 'group',
        scopeId: `epic:${epicId}`,
        scopeLabel: `Epic ${epicId}`,
        triggerReasons: [],
        taskIds: [],
        epicId,
        parentId,
      }, task);
    } else if (parentId) {
      this.evaluateScope({
        scope: 'group',
        scopeId: `parent:${parentId}`,
        scopeLabel: `Parent work item ${parentId}`,
        triggerReasons: [],
        taskIds: [],
        epicId,
        parentId,
      }, task);
    }

    // Always update global scope to guarantee periodic reviews
    this.evaluateScope({
      scope: 'global',
      scopeId: GLOBAL_SCOPE_KEY,
      scopeLabel: 'Global roadmap flow',
      triggerReasons: [],
      taskIds: [],
    }, task);
  }

  private evaluateScope(baseContext: ReviewContext, task: Task): void {
    const stats = this.getStats(baseContext.scopeId);

    stats.recentTaskIds.push(task.id);
    if (stats.recentTaskIds.length > this.config.maxTasksTracked) {
      stats.recentTaskIds.shift();
    }

    if (stats.pendingReview) {
      return;
    }

    stats.completedSinceReview += 1;
    const now = Date.now();
    const elapsedSinceReview = now - stats.lastReviewAt;
    const triggerReasons: string[] = [];

    if (baseContext.scope === 'group' && stats.completedSinceReview >= this.config.minTasksPerGroup) {
      triggerReasons.push(`Completed ${stats.completedSinceReview} tasks since last review`);
    }

    if (baseContext.scope === 'global' && stats.completedSinceReview >= this.config.globalMinTasks) {
      triggerReasons.push(`Global completion threshold reached (${stats.completedSinceReview})`);
    }

    if (elapsedSinceReview >= this.config.maxGroupIntervalMs && baseContext.scope === 'group') {
      triggerReasons.push(`More than ${Math.round(this.config.maxGroupIntervalMs / 60000)} minutes without a review`);
    }

    if (elapsedSinceReview >= this.config.globalIntervalMs && baseContext.scope === 'global') {
      triggerReasons.push(`Global review interval exceeded (${Math.round(this.config.globalIntervalMs / 60000)} minutes)`);
    }

    if (triggerReasons.length === 0) {
      return;
    }

    const context: ReviewContext = {
      ...baseContext,
      triggerReasons,
      taskIds: [...stats.recentTaskIds],
    };

    this.scheduleReview(context, stats, now);
  }

  private scheduleReview(context: ReviewContext, stats: GroupStats, timestamp: number): void {
    stats.completedSinceReview = 0;
    stats.lastReviewAt = timestamp;

    const tasksForReview = context.taskIds.slice(-this.config.maxTasksTracked);
    const reviewId = `orchestrator:review:${context.scope}:${randomUUID()}`;

    if (this.config.dryRun) {
      logInfo('Holistic review (dry-run) would be scheduled', {
        reviewId,
        scope: context.scope,
        scopeLabel: context.scopeLabel,
        triggerReasons: context.triggerReasons,
        tasks: tasksForReview,
      });
      stats.recentTaskIds = [];
      stats.pendingReview = false;
      return;
    }

    stats.pendingReview = true;

    const description = this.buildReviewDescription(context, tasksForReview);

    const metadata: ReviewMetadata = {
      review_kind: 'holistic',
      review_scope: context.scope,
      review_scope_label: context.scopeLabel,
      trigger_reasons: context.triggerReasons,
      recent_tasks: tasksForReview,
      requested_actions: {
        create_remediation_tasks: true,
        fix_issues_immediately: true,
      },
      generated_at: timestamp,
    };

    const reviewTask = this.stateMachine.createTask({
      id: reviewId,
      title: `Holistic review: ${context.scopeLabel}`,
      description,
      type: 'task',
      status: 'pending',
      estimated_complexity: 6,
      metadata,
    });

    this.reviewTaskIndex.set(reviewTask.id, context.scopeId);

    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'holistic_review',
      content: `Scheduled holistic review task ${reviewTask.id} for ${context.scopeLabel}.`,
      confidence: 0.85,
      metadata: {
        review_task: reviewTask.id,
        scope: context.scope,
        scope_label: context.scopeLabel,
        trigger_reasons: context.triggerReasons,
        recent_tasks: tasksForReview,
      },
    });

    logInfo('Holistic review task scheduled', {
      reviewTaskId: reviewTask.id,
      scope: context.scope,
      scopeLabel: context.scopeLabel,
      triggerReasons: context.triggerReasons,
      taskCount: tasksForReview.length,
    });

    stats.recentTaskIds = [];
  }

  private observeReviewProgress(task: Task, to: TaskStatus): void {
    const metadata = this.extractReviewMetadata(task);
    if (metadata?.review_kind !== 'holistic') {
      return;
    }

    const scopeKey = metadata.review_scope ?? GLOBAL_SCOPE_KEY;
    const stats = this.getStats(scopeKey);

    if (to === 'done') {
      stats.pendingReview = false;
      stats.lastReviewAt = Date.now();
      stats.completedSinceReview = 0;
      stats.recentTaskIds = [];
      this.reviewTaskIndex.delete(task.id);
      logInfo('Holistic review completed', {
        reviewTaskId: task.id,
        scope: scopeKey,
      });
      return;
    }

    if (to === 'needs_improvement') {
      logWarning('Holistic review surfaced issues requiring follow-up', {
        reviewTaskId: task.id,
        scope: scopeKey,
      });
    }
  }

  private getStats(scopeKey: string): GroupStats {
    const existing = this.groupStats.get(scopeKey);
    if (existing) {
      return existing;
    }
    const stats: GroupStats = {
      recentTaskIds: [],
      completedSinceReview: 0,
      lastReviewAt: 0,
      pendingReview: false,
    };
    this.groupStats.set(scopeKey, stats);
    return stats;
  }

  private buildReviewDescription(context: ReviewContext, taskIds: string[]): string {
    const taskList =
      taskIds.length === 0
        ? '- No specific tasks supplied (perform a broad regression review).'
        : taskIds
            .map(id => `- Task ${id}: confirm objectives were met, stress test the implementation, and validate downstream impacts.`)
            .join('\n');

    return [
      `You are the Holistic Review Sentinel for ${context.scopeLabel}. Conduct an adversarial, end-to-end inspection of the recent delivery to ensure it is robust, correct, and production ready.`,
      '',
      '## Review Inputs',
      taskList,
      '',
      '## Required Actions',
      '- Probe for regressions, missing test coverage, data quality drift, and unmet roadmap intent.',
      '- If you detect an issue you can remediate quickly, perform the fix immediately as part of this task and document the change.',
      '- When an issue needs deeper follow-up, create focused remediation tasks in the roadmap with clear acceptance criteria.',
      '- Report a concise summary of what you validated, gaps you found, and the actions you took.',
      '',
      '## Completion Criteria',
      '- You produced an evidence-backed summary in the task log (include links to diffs/tests).',
      '- All discovered gaps are either fixed or tracked via new remediation tasks.',
      '- Verification steps (tests, lint, smoke checks) are attached or referenced.',
    ].join('\n');
  }

  private extractReviewMetadata(task: Task): ReviewMetadata | undefined {
    if (!task.metadata || typeof task.metadata !== 'object') {
      return undefined;
    }
    const candidate = task.metadata as Record<string, unknown>;
    const kind = candidate.review_kind;
    if (kind !== 'holistic') {
      return undefined;
    }
    return candidate as ReviewMetadata;
  }

  private safeGetTasks(): Task[] {
    try {
      return this.stateMachine.getTasks();
    } catch (error) {
      logWarning('Failed to bootstrap existing review tasks', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
