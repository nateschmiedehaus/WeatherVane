/**
 * Resilience Manager - Handles failures, limits, and recovery
 *
 * Critical Features:
 * - Rate Limit Detection → Cooldown agent, reassign task
 * - Context Limit Detection → Save checkpoint, start fresh session
 * - Automatic retry logic with exponential backoff
 * - Graceful degradation when agents are unavailable
 */

import { EventEmitter } from 'node:events';

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

import type { AgentPool, ExecutionFailureType } from './agent_pool.js';
import type { StateMachine, Task } from './state_machine.js';

export interface FailureContext {
  taskId: string;
  agentId: string;
  failureType: ExecutionFailureType;
  retryAfterSeconds?: number;
  attemptNumber: number;
  originalError: string;
}

export interface RecoveryAction {
  action: 'retry' | 'reassign' | 'checkpoint_and_retry' | 'fail_task';
  delaySeconds?: number;
  newAgentType?: 'claude_code' | 'codex';
  reasoning: string;
}

export class ResilienceManager extends EventEmitter {
  private taskAttempts: Map<string, number> = new Map();
  private lastContextLimitTime: number = 0;
  private readonly maxAttemptsPerTask = 3;
  private readonly contextLimitCooldown = 300; // 5 minutes between context limit triggers

  constructor(
    private stateMachine: StateMachine,
    private agentPool: AgentPool
  ) {
    super();

    // Clean up task attempts when tasks complete to prevent unbounded growth
    this.stateMachine.on('task:completed', (task: any) => {
      this.taskAttempts.delete(task.id);
    });
  }

  /**
   * Handle execution failure and determine recovery action
   */
  async handleFailure(context: FailureContext): Promise<RecoveryAction> {
    const attempts = this.taskAttempts.get(context.taskId) || 0;
    this.taskAttempts.set(context.taskId, attempts + 1);

    logWarning('Task execution failed', {
      taskId: context.taskId,
      agentId: context.agentId,
      failureType: context.failureType,
      attemptNumber: context.attemptNumber,
      retriesRemaining: this.maxAttemptsPerTask - attempts - 1
    });

    // Handle based on failure type
    switch (context.failureType) {
      case 'rate_limit':
        return this.handleRateLimit(context, attempts);

      case 'context_limit':
        return this.handleContextLimit(context, attempts);

      case 'validation':
        return this.handleValidationFailure(context, attempts);

      case 'other':
      default:
        return this.handleGenericFailure(context, attempts);
    }
  }

  /**
   * Handle rate limit - cooldown agent and reassign to different agent
   */
  private handleRateLimit(context: FailureContext, attempts: number): RecoveryAction {
    const retryAfter = context.retryAfterSeconds || 300;

    // Apply cooldown to the failing agent
    this.agentPool.imposeCooldown(context.agentId, retryAfter);

    logInfo('Agent on cooldown due to rate limit', {
      agentId: context.agentId,
      cooldownSeconds: retryAfter,
      taskId: context.taskId
    });

    // If we still have attempts left, reassign to a different agent
    if (attempts < this.maxAttemptsPerTask) {
      const agentType = context.agentId.startsWith('codex') ? 'codex' : 'claude_code';
      const alternateType = agentType === 'codex' ? 'claude_code' : 'codex';

      // Check if alternate agent type is available
      if (this.agentPool.hasAvailableAgent(alternateType)) {
        return {
          action: 'reassign',
          newAgentType: alternateType,
          delaySeconds: 5,
          reasoning: `Rate limit on ${agentType}, switching to ${alternateType}`
        };
      }

      // All agents of both types busy/on cooldown - wait and retry
      return {
        action: 'retry',
        delaySeconds: Math.min(retryAfter, 600), // Max 10 min wait
        reasoning: `All agents busy, waiting ${retryAfter}s for cooldown`
      };
    }

    // Exhausted retries
    return {
      action: 'fail_task',
      reasoning: `Rate limit exhausted after ${attempts} attempts`
    };
  }

  /**
   * Handle context limit - CRITICAL: Codex needs /new, we need checkpoint
   */
  private async handleContextLimit(context: FailureContext, attempts: number): Promise<RecoveryAction> {
    const now = Date.now();
    const timeSinceLastContextLimit = (now - this.lastContextLimitTime) / 1000;

    logError('Context limit exceeded - session too long', {
      taskId: context.taskId,
      agentId: context.agentId,
      attemptNumber: context.attemptNumber,
      timeSinceLastLimit: Math.round(timeSinceLastContextLimit)
    });

    this.lastContextLimitTime = now;

    // If context limits are happening too frequently, something's wrong
    if (timeSinceLastContextLimit < this.contextLimitCooldown) {
      logError('Frequent context limits detected - possible prompt bloat', {
        taskId: context.taskId,
        frequency: timeSinceLastContextLimit,
        threshold: this.contextLimitCooldown
      });

      return {
        action: 'fail_task',
        reasoning: 'Context limits happening too frequently - prompt may be too large'
      };
    }

    // Create checkpoint before attempting recovery
    await this.createEmergencyCheckpoint(context);

    // If we still have attempts, try with a fresh session
    if (attempts < this.maxAttemptsPerTask) {
      // For Codex: The agent pool will start a new session automatically
      // For Claude Code: Same - new execution
      // The key is that we've saved state, so we can resume

      return {
        action: 'checkpoint_and_retry',
        delaySeconds: 10,
        reasoning: 'Context limit exceeded - saved checkpoint, will retry with fresh session'
      };
    }

    return {
      action: 'fail_task',
      reasoning: `Context limit exceeded after ${attempts} attempts - task may be too complex`
    };
  }

  /**
   * Handle generic failures
   */
  private handleValidationFailure(context: FailureContext, attempts: number): RecoveryAction {
    if (attempts < this.maxAttemptsPerTask) {
      return {
        action: 'retry',
        delaySeconds: 5,
        reasoning: 'Output validation failed - retrying for correct DSL format',
      };
    }

    return {
      action: 'fail_task',
      reasoning: `Validation failures persisted after ${attempts} attempts`,
    };
  }

  private handleGenericFailure(context: FailureContext, attempts: number): RecoveryAction {
    if (attempts < this.maxAttemptsPerTask) {
      // Exponential backoff: 30s, 60s, 120s
      const delaySeconds = 30 * Math.pow(2, attempts);

      return {
        action: 'retry',
        delaySeconds: Math.min(delaySeconds, 300), // Max 5 minutes
        reasoning: `Generic failure - retry with exponential backoff (${delaySeconds}s)`
      };
    }

    return {
      action: 'fail_task',
      reasoning: `Failed after ${attempts} attempts with generic errors`
    };
  }

  /**
   * Create emergency checkpoint when context limit hit
   */
  private async createEmergencyCheckpoint(context: FailureContext): Promise<void> {
    try {
      const task = this.stateMachine.getTask(context.taskId);
      if (!task) return;

      // Get current roadmap state
      const health = this.stateMachine.getRoadmapHealth();

      // Create checkpoint with context limit marker
      await this.stateMachine.createCheckpoint({
        session_id: `emergency_${Date.now()}`,
        git_sha: undefined,
        state_snapshot: {
          trigger: 'context_limit',
          taskId: context.taskId,
          agentId: context.agentId,
          roadmap_health: health,
          timestamp: Date.now(),
          notes: 'Emergency checkpoint created due to context limit'
        },
        notes: `Context limit on task ${context.taskId} - session will restart fresh`
      });

      // Also add a context entry documenting this
      this.stateMachine.addContextEntry({
        entry_type: 'learning',
        topic: 'Context Limit Recovery',
        content: `Task ${context.taskId} hit context limit with agent ${context.agentId}. Checkpoint created. Will retry with fresh session and more compact context.`,
        related_tasks: [context.taskId],
        confidence: 1.0
      });

      logInfo('Emergency checkpoint created', {
        taskId: context.taskId,
        reason: 'context_limit'
      });

      this.emit('checkpoint:emergency', {
        taskId: context.taskId,
        trigger: 'context_limit'
      });
    } catch (error) {
      logError('Failed to create emergency checkpoint', {
        error: error instanceof Error ? error.message : String(error),
        taskId: context.taskId
      });
    }
  }

  /**
   * Check if task has exhausted retry attempts
   */
  hasExhaustedRetries(taskId: string): boolean {
    const attempts = this.taskAttempts.get(taskId) || 0;
    return attempts >= this.maxAttemptsPerTask;
  }

  /**
   * Reset retry count (e.g., after successful completion)
   */
  resetRetries(taskId: string): void {
    this.taskAttempts.delete(taskId);
  }

  /**
   * Get current retry attempt number
   */
  getAttemptNumber(taskId: string): number {
    return (this.taskAttempts.get(taskId) || 0) + 1;
  }

  /**
   * Get metrics about failures and recoveries
   */
  getMetrics(): {
    activeTasks: number;
    tasksWithRetries: number;
    totalRetryAttempts: number;
    recentContextLimits: boolean;
  } {
    const totalRetries = Array.from(this.taskAttempts.values()).reduce((sum, count) => sum + count, 0);

    return {
      activeTasks: this.taskAttempts.size,
      tasksWithRetries: this.taskAttempts.size,
      totalRetryAttempts: totalRetries,
      recentContextLimits: Date.now() - this.lastContextLimitTime < this.contextLimitCooldown * 1000
    };
  }
}
