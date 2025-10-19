/**
 * PolicyEngine - Decision making logic for the orchestrator
 *
 * This class encapsulates all the policy decisions that the orchestrator makes:
 * - When to run tasks vs critics
 * - When to escalate issues
 * - When to restart workers
 * - When to wait/throttle
 *
 * Based on architecture refactor Phase 1: Extract Core Loop
 * See: /tmp/architecture_critique_synthesis.md lines 285-329
 */

import type { StateMachine } from './state_machine.js';
import type { Task } from './state_machine.js';

/**
 * OrchestratorAction - Actions the orchestrator can take
 */
export type OrchestratorAction =
  | { type: 'run_task'; task: Task }
  | { type: 'run_critic'; critic: string; category?: string }
  | { type: 'restart_worker'; reason: string }
  | { type: 'escalate'; issue: string; severity: 'low' | 'medium' | 'high' | 'critical' }
  | { type: 'wait'; duration: number; reason?: string }
  | { type: 'idle'; reason: string };

/**
 * SystemState - Current state of the system
 */
export interface SystemState {
  pendingTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  workerHealthy: boolean;
  lastCriticRun?: number;
  criticPending?: string[];
  tokenPressure: 'low' | 'medium' | 'high';
  errorRate: number;
}

/**
 * PolicyConfig - Configuration for policy engine
 */
export interface PolicyConfig {
  /**
   * Maximum time between critic runs (ms)
   */
  maxCriticInterval?: number;

  /**
   * Error rate threshold for escalation (0-1)
   */
  errorThreshold?: number;

  /**
   * Wait duration when idle (ms)
   */
  idleWaitDuration?: number;

  /**
   * Maximum concurrent tasks
   */
  maxConcurrentTasks?: number;

  /**
   * Enable dry-run mode (no actual execution)
   */
  dryRun?: boolean;
}

/**
 * PolicyEngine - Decides what action the orchestrator should take
 */
export class PolicyEngine {
  private readonly config: Required<PolicyConfig>;

  constructor(
    private readonly stateMachine: StateMachine,
    config: PolicyConfig = {}
  ) {
    this.config = {
      maxCriticInterval: config.maxCriticInterval ?? 30 * 60 * 1000, // 30 minutes
      errorThreshold: config.errorThreshold ?? 0.05, // 5% error rate
      idleWaitDuration: config.idleWaitDuration ?? 5000, // 5 seconds
      maxConcurrentTasks: config.maxConcurrentTasks ?? 3,
      dryRun: config.dryRun ?? false,
    };
  }

  /**
   * Decide what action to take based on current state
   */
  decide(state: SystemState): OrchestratorAction {
    // Priority 1: Handle critical issues
    if (!state.workerHealthy) {
      return {
        type: 'restart_worker',
        reason: 'worker_unhealthy',
      };
    }

    if (state.errorRate > this.config.errorThreshold) {
      return {
        type: 'escalate',
        issue: `Error rate ${(state.errorRate * 100).toFixed(1)}% exceeds threshold ${(this.config.errorThreshold * 100).toFixed(1)}%`,
        severity: state.errorRate > 0.2 ? 'critical' : 'high',
      };
    }

    // Priority 2: Run critics if needed
    const now = Date.now();
    const criticDue = state.lastCriticRun
      ? now - state.lastCriticRun > this.config.maxCriticInterval
      : true;

    if (criticDue && state.criticPending && state.criticPending.length > 0) {
      return {
        type: 'run_critic',
        critic: state.criticPending[0],
      };
    }

    // Priority 3: Run tasks if capacity available
    if (state.pendingTasks > 0 && state.inProgressTasks < this.config.maxConcurrentTasks) {
      const nextTask = this.getNextTask();
      if (nextTask) {
        return {
          type: 'run_task',
          task: nextTask,
        };
      }
    }

    // Priority 4: Handle blocked tasks
    if (state.blockedTasks > 0 && state.pendingTasks === 0) {
      return {
        type: 'escalate',
        issue: `${state.blockedTasks} tasks blocked with no pending work`,
        severity: 'medium',
      };
    }

    // Priority 5: Wait/throttle based on token pressure
    if (state.tokenPressure === 'high') {
      return {
        type: 'wait',
        duration: this.config.idleWaitDuration * 2, // Wait longer under pressure
        reason: 'token_pressure_high',
      };
    }

    // Default: Idle
    return {
      type: 'idle',
      reason: state.pendingTasks === 0 ? 'no_pending_tasks' : 'at_capacity',
    };
  }

  /**
   * Get the next task to execute
   *
   * This is a simplified version - the real implementation should use
   * the TaskScheduler's priority logic.
   */
  private getNextTask(): Task | null {
    try {
      // Get pending tasks from state machine
      const tasks = this.stateMachine.getTasks({ status: ['pending'] });

      if (!tasks || tasks.length === 0) {
        return null;
      }

      // Simple priority: first pending task
      // In production, this should use TaskScheduler.getNextTasks()
      return tasks[0];
    } catch (error) {
      // Defensive: Don't crash on state machine errors
      return null;
    }
  }

  /**
   * Get current system state
   */
  getSystemState(): SystemState {
    try {
      const tasks = this.stateMachine.getTasks();
      const pending = tasks.filter(t => t.status === 'pending').length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const blocked = tasks.filter(t => t.status === 'blocked').length;

      // TODO: Implement actual metrics
      const workerHealthy = true; // Placeholder
      const tokenPressure: 'low' | 'medium' | 'high' = 'low'; // Placeholder
      const errorRate = 0; // Placeholder

      return {
        pendingTasks: pending,
        inProgressTasks: inProgress,
        blockedTasks: blocked,
        workerHealthy,
        tokenPressure,
        errorRate,
      };
    } catch (error) {
      // Defensive fallback state
      return {
        pendingTasks: 0,
        inProgressTasks: 0,
        blockedTasks: 0,
        workerHealthy: false,
        tokenPressure: 'low',
        errorRate: 0,
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PolicyConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<PolicyConfig>> {
    return { ...this.config };
  }
}
