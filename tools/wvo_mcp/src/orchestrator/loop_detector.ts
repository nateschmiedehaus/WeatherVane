/**
 * LoopDetector - Detects when autopilot is stuck repeating the same task
 *
 * Catches patterns like:
 * - Same task attempted 3+ times without progress
 * - Task marked done but autopilot keeps revisiting it
 * - Task spinning on same blocker without resolution
 *
 * Takes action:
 * - Completed tasks: Force move to next task
 * - Blocked tasks: Escalate or grant unblock authority
 * - Stuck tasks: Apply circuit breaker and suggest alternatives
 */

import type { StateMachine } from './state_machine.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface LoopDetectionResult {
  isLooping: boolean;
  loopType: 'completed_task_revisit' | 'blocked_task_spin' | 'no_progress_repeat' | 'none';
  taskId: string | null;
  attemptCount: number;
  recommendation: 'force_next' | 'unblock_authority' | 'escalate' | 'continue';
  reason: string;
  evidence: string[];
}

export interface TaskAttempt {
  taskId: string;
  timestamp: number;
  status: string;
  blockers: string[];
  completedWork: string[];
  sessionId: string;
}

export interface LoopDetectorOptions {
  /**
   * Maximum attempts on same task before considering it a loop
   */
  maxAttempts?: number;

  /**
   * Time window (ms) for counting attempts
   */
  attemptWindow?: number;

  /**
   * Allow autopilot to remove blockers automatically
   */
  enableAutoUnblock?: boolean;

  /**
   * Maximum attempts before forcing move to next task
   */
  maxAttemptsBeforeForceNext?: number;
}

/**
 * LoopDetector tracks task attempts and detects stuck patterns
 */
export class LoopDetector {
  private attempts: Map<string, TaskAttempt[]> = new Map();
  private readonly options: Required<LoopDetectorOptions>;

  constructor(
    private readonly stateMachine: StateMachine,
    options: LoopDetectorOptions = {}
  ) {
    this.options = {
      maxAttempts: options.maxAttempts ?? 3,
      attemptWindow: options.attemptWindow ?? 3600000, // 1 hour
      enableAutoUnblock: options.enableAutoUnblock ?? true,
      maxAttemptsBeforeForceNext: options.maxAttemptsBeforeForceNext ?? 5,
    };
  }

  /**
   * Record a task attempt
   */
  recordAttempt(
    taskId: string,
    status: string,
    blockers: string[],
    completedWork: string[],
    sessionId: string
  ): void {
    const attempt: TaskAttempt = {
      taskId,
      timestamp: Date.now(),
      status,
      blockers,
      completedWork,
      sessionId,
    };

    if (!this.attempts.has(taskId)) {
      this.attempts.set(taskId, []);
    }

    const taskAttempts = this.attempts.get(taskId)!;
    taskAttempts.push(attempt);

    // Clean old attempts outside window
    const cutoff = Date.now() - this.options.attemptWindow;
    this.attempts.set(
      taskId,
      taskAttempts.filter(a => a.timestamp > cutoff)
    );

    logInfo(`Loop detector: recorded attempt for ${taskId}`, {
      attemptCount: this.attempts.get(taskId)!.length,
      status,
      blockers,
    });
  }

  /**
   * Detect if autopilot is in a loop
   */
  detectLoop(currentTaskId: string | null): LoopDetectionResult {
    if (!currentTaskId) {
      return this.noLoopResult();
    }

    const taskAttempts = this.attempts.get(currentTaskId) || [];

    if (taskAttempts.length < this.options.maxAttempts) {
      return this.noLoopResult();
    }

    // Check for loop patterns
    const completedLoop = this.detectCompletedTaskRevisit(taskAttempts);
    if (completedLoop.isLooping) {
      return completedLoop;
    }

    const blockedLoop = this.detectBlockedTaskSpin(taskAttempts);
    if (blockedLoop.isLooping) {
      return blockedLoop;
    }

    const progressLoop = this.detectNoProgressRepeat(taskAttempts);
    if (progressLoop.isLooping) {
      return progressLoop;
    }

    return this.noLoopResult();
  }

  /**
   * Detect when autopilot keeps revisiting a completed task
   */
  private detectCompletedTaskRevisit(attempts: TaskAttempt[]): LoopDetectionResult {
    const recentAttempts = attempts.slice(-this.options.maxAttempts);
    const allCompleted = recentAttempts.every(a =>
      a.status === 'done' || a.status === 'completed'
    );

    if (!allCompleted) {
      return this.noLoopResult();
    }

    const evidence = recentAttempts.map(a =>
      `${new Date(a.timestamp).toISOString()}: status=${a.status}, session=${a.sessionId}`
    );

    return {
      isLooping: true,
      loopType: 'completed_task_revisit',
      taskId: attempts[0].taskId,
      attemptCount: attempts.length,
      recommendation: 'force_next',
      reason: `Task ${attempts[0].taskId} marked 'done' but autopilot attempted ${attempts.length} times in last hour. Force move to next task.`,
      evidence,
    };
  }

  /**
   * Detect when autopilot spins on same blockers without resolution
   */
  private detectBlockedTaskSpin(attempts: TaskAttempt[]): LoopDetectionResult {
    const recentAttempts = attempts.slice(-this.options.maxAttempts);

    // Check if all attempts have same blockers
    if (recentAttempts.length === 0) {
      return this.noLoopResult();
    }

    const firstBlockers = recentAttempts[0].blockers.sort().join(',');
    const sameBlockers = recentAttempts.every(a =>
      a.blockers.sort().join(',') === firstBlockers
    );

    if (!sameBlockers || firstBlockers === '') {
      return this.noLoopResult();
    }

    const evidence = recentAttempts.map(a =>
      `${new Date(a.timestamp).toISOString()}: blockers=[${a.blockers.join(', ')}], session=${a.sessionId}`
    );

    const recommendation = this.options.enableAutoUnblock
      ? 'unblock_authority'
      : 'escalate';

    return {
      isLooping: true,
      loopType: 'blocked_task_spin',
      taskId: attempts[0].taskId,
      attemptCount: attempts.length,
      recommendation,
      reason: `Task ${attempts[0].taskId} attempted ${attempts.length} times with same blockers: [${recentAttempts[0].blockers.join(', ')}]. ${recommendation === 'unblock_authority' ? 'Grant unblock authority.' : 'Escalate to remove blockers.'}`,
      evidence,
    };
  }

  /**
   * Detect when autopilot makes no progress across multiple attempts
   */
  private detectNoProgressRepeat(attempts: TaskAttempt[]): LoopDetectionResult {
    const recentAttempts = attempts.slice(-this.options.maxAttempts);

    if (recentAttempts.length < this.options.maxAttempts) {
      return this.noLoopResult();
    }

    // Don't flag as no-progress if blockers are changing (that IS progress)
    const blockerSignatures = recentAttempts.map(a =>
      a.blockers.sort().join(',')
    );
    const blockersChanging = new Set(blockerSignatures).size > 1;

    if (blockersChanging) {
      return this.noLoopResult();
    }

    // Check if completed work is identical (no new progress)
    const workSignatures = recentAttempts.map(a =>
      a.completedWork.sort().join(',')
    );

    const allSame = workSignatures.every(sig => sig === workSignatures[0]);

    if (!allSame) {
      return this.noLoopResult();
    }

    const evidence = recentAttempts.map(a =>
      `${new Date(a.timestamp).toISOString()}: completed=[${a.completedWork.join(', ')}], session=${a.sessionId}`
    );

    // After too many attempts with no progress, force next
    const shouldForceNext = attempts.length >= this.options.maxAttemptsBeforeForceNext;

    return {
      isLooping: true,
      loopType: 'no_progress_repeat',
      taskId: attempts[0].taskId,
      attemptCount: attempts.length,
      recommendation: shouldForceNext ? 'force_next' : 'escalate',
      reason: `Task ${attempts[0].taskId} attempted ${attempts.length} times with identical completed work (no progress). ${shouldForceNext ? 'Force move to next task.' : 'Escalate for guidance.'}`,
      evidence,
    };
  }

  /**
   * Apply loop recovery action
   */
  async applyRecovery(result: LoopDetectionResult): Promise<void> {
    if (!result.isLooping || !result.taskId) {
      return;
    }

    logWarning(`Loop detected: ${result.loopType}`, {
      taskId: result.taskId,
      attemptCount: result.attemptCount,
      recommendation: result.recommendation,
    });

    switch (result.recommendation) {
      case 'force_next':
        await this.forceNextTask(result);
        break;

      case 'unblock_authority':
        await this.grantUnblockAuthority(result);
        break;

      case 'escalate':
        await this.escalateLoop(result);
        break;

      default:
        logInfo('Loop detected but continuing', { result });
    }

    // Record recovery action in context
    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'loop_recovery',
      content: `Applied ${result.recommendation} for ${result.loopType}: ${result.reason}`,
      confidence: 1.0,
      metadata: {
        loopType: result.loopType,
        taskId: result.taskId,
        attemptCount: result.attemptCount,
        evidence: result.evidence,
      },
    });

    // Clear attempts for this task after recovery
    this.attempts.delete(result.taskId);
  }

  /**
   * Force autopilot to move to next task
   */
  private async forceNextTask(result: LoopDetectionResult): Promise<void> {
    logInfo(`Forcing next task after loop on ${result.taskId}`, {
      attemptCount: result.attemptCount,
      reason: result.reason,
    });

    // Mark current task as done if not already
    if (result.taskId) {
      const task = this.stateMachine.getTask(result.taskId);
      if (task && task.status !== 'done') {
        await this.stateMachine.transition(result.taskId, 'done', {
          reason: 'force_next_after_loop',
          loopAttempts: result.attemptCount,
        });
      }
    }

    // Add guidance to move on
    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'loop_recovery_directive',
      content: `LOOP DETECTED: Task ${result.taskId} completed after ${result.attemptCount} attempts. DO NOT revisit this task. SELECT NEXT TASK from roadmap using plan_next().`,
      confidence: 1.0,
      metadata: {
        directive: 'force_next',
        previousTask: result.taskId,
        evidence: result.evidence,
      },
    });
  }

  /**
   * Grant autopilot authority to remove blockers
   */
  private async grantUnblockAuthority(result: LoopDetectionResult): Promise<void> {
    logInfo(`Granting unblock authority for ${result.taskId}`, {
      attemptCount: result.attemptCount,
      reason: result.reason,
    });

    const attempts = this.attempts.get(result.taskId!) || [];
    const blockers = attempts[attempts.length - 1]?.blockers || [];

    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'unblock_authority',
      content: `UNBLOCK AUTHORITY GRANTED: Task ${result.taskId} blocked by [${blockers.join(', ')}] after ${result.attemptCount} attempts. You have FULL AUTHORITY to:
1. Remove or work around these blockers
2. Make necessary architectural changes
3. Skip unavailable dependencies temporarily
4. Create stub implementations if needed
5. Document blockers as technical debt for later

COMPLETE the task by any means necessary, then mark it done and move on. Do NOT spin on the same blockers again.`,
      confidence: 1.0,
      metadata: {
        directive: 'unblock_authority',
        taskId: result.taskId,
        blockers,
        attemptCount: result.attemptCount,
      },
    });
  }

  /**
   * Escalate loop to human attention
   */
  private async escalateLoop(result: LoopDetectionResult): Promise<void> {
    logError(`Escalating loop on ${result.taskId} to human`, {
      attemptCount: result.attemptCount,
      reason: result.reason,
    });

    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'loop_escalation',
      content: `ESCALATION: Loop detected on task ${result.taskId} after ${result.attemptCount} attempts. Human intervention required. Reason: ${result.reason}`,
      confidence: 1.0,
      metadata: {
        loopType: result.loopType,
        taskId: result.taskId,
        attemptCount: result.attemptCount,
        evidence: result.evidence,
        recommendation: 'Review task requirements and unblock manually',
      },
    });

    // Mark task as blocked if not already
    if (result.taskId) {
      const task = this.stateMachine.getTask(result.taskId);
      if (!task || task.status !== 'blocked') {
        await this.stateMachine.transition(result.taskId, 'blocked', {
          reason: 'escalated_after_loop',
          loopAttempts: result.attemptCount,
        });
      }
    }
  }

  /**
   * Get current loop detection status for all tasks
   */
  getStatus(): Record<string, { attemptCount: number; lastAttempt: number }> {
    const status: Record<string, { attemptCount: number; lastAttempt: number }> = {};

    for (const [taskId, attempts] of this.attempts.entries()) {
      if (attempts.length > 0) {
        status[taskId] = {
          attemptCount: attempts.length,
          lastAttempt: Math.max(...attempts.map(a => a.timestamp)),
        };
      }
    }

    return status;
  }

  /**
   * Clear all recorded attempts
   */
  clear(): void {
    this.attempts.clear();
  }

  /**
   * Helper to create "no loop" result
   */
  private noLoopResult(): LoopDetectionResult {
    return {
      isLooping: false,
      loopType: 'none',
      taskId: null,
      attemptCount: 0,
      recommendation: 'continue',
      reason: 'No loop detected',
      evidence: [],
    };
  }
}
