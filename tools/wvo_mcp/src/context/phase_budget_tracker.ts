/**
 * Phase Budget Tracker
 *
 * Tracks token and latency usage during phase execution.
 * Singleton that coordinates between Model Router and WorkProcessEnforcer.
 */

import { WorkPhase } from '../orchestrator/work_process_enforcer.js';
import { PhaseBudget } from './phase_budget_calculator.js';

export type BudgetBreachStatus = 'within' | 'warning' | 'exceeded';

export interface PhaseExecution {
  task_id: string;
  phase: WorkPhase;
  start_time: Date;
  end_time?: Date;
  tokens_used: number;
  tokens_limit: number;
  latency_ms?: number;
  latency_limit_ms: number;
  breach_status?: BudgetBreachStatus;
  tokens_estimated: boolean; // True if tokens were estimated, not reported by model
}

export interface TaskBudgetStatus {
  task_id: string;
  phase_executions: PhaseExecution[];
  total_tokens_used: number;
  total_tokens_limit: number;
  total_latency_ms: number;
  total_latency_limit_ms: number;
  cumulative_breach_status: BudgetBreachStatus;
}

/**
 * Phase Budget Tracker (Singleton)
 */
export class PhaseBudgetTracker {
  private static instance: PhaseBudgetTracker;
  private currentTracking?: {
    taskId: string;
    phase: WorkPhase;
    budget: PhaseBudget;
    startTime: Date;
    tokensUsed: number;
  };
  private executions: Map<string, PhaseExecution[]> = new Map();

  private constructor() {}

  static getInstance(): PhaseBudgetTracker {
    if (!PhaseBudgetTracker.instance) {
      PhaseBudgetTracker.instance = new PhaseBudgetTracker();
    }
    return PhaseBudgetTracker.instance;
  }

  /**
   * Start tracking a phase execution
   */
  startPhaseTracking(taskId: string, phase: WorkPhase, budget: PhaseBudget): void {
    if (this.currentTracking) {
      throw new Error(
        `Cannot start phase ${phase} for task ${taskId} - phase ${this.currentTracking.phase} for task ${this.currentTracking.taskId} is still active`
      );
    }

    this.currentTracking = {
      taskId,
      phase,
      budget,
      startTime: new Date(),
      tokensUsed: 0,
    };
  }

  /**
   * Report token usage (called by Model Router after LLM call)
   */
  reportTokenUsage(tokens: number): void {
    if (!this.currentTracking) {
      console.warn('reportTokenUsage called but no active phase tracking');
      return;
    }

    this.currentTracking.tokensUsed += tokens;
  }

  /**
   * End phase tracking and return execution record
   */
  endPhaseTracking(tokensEstimated: boolean = false): PhaseExecution {
    if (!this.currentTracking) {
      throw new Error('endPhaseTracking called but no active phase tracking');
    }

    const endTime = new Date();
    const latencyMs = endTime.getTime() - this.currentTracking.startTime.getTime();

    // Sanity check for clock skew
    const validLatency = latencyMs >= 0 && latencyMs < 86400000; // 0-24 hours

    const execution: PhaseExecution = {
      task_id: this.currentTracking.taskId,
      phase: this.currentTracking.phase,
      start_time: this.currentTracking.startTime,
      end_time: endTime,
      tokens_used: this.currentTracking.tokensUsed,
      tokens_limit: this.currentTracking.budget.token_limit,
      latency_ms: validLatency ? latencyMs : 0,
      latency_limit_ms: this.currentTracking.budget.latency_limit_ms,
      breach_status: this.calculateBreachStatus(
        this.currentTracking.tokensUsed,
        this.currentTracking.budget.token_limit,
        validLatency ? latencyMs : 0,
        this.currentTracking.budget.latency_limit_ms
      ),
      tokens_estimated: tokensEstimated,
    };

    // Store execution
    const taskExecutions = this.executions.get(execution.task_id) || [];
    taskExecutions.push(execution);
    this.executions.set(execution.task_id, taskExecutions);

    // Clear current tracking
    this.currentTracking = undefined;

    return execution;
  }

  /**
   * Get budget status for a task
   */
  getTaskBudgetStatus(taskId: string): TaskBudgetStatus | null {
    const executions = this.executions.get(taskId);
    if (!executions || executions.length === 0) {
      return null;
    }

    const totalTokensUsed = executions.reduce((sum, exec) => sum + exec.tokens_used, 0);
    const totalTokensLimit = executions.reduce((sum, exec) => sum + exec.tokens_limit, 0);
    const totalLatencyMs = executions.reduce((sum, exec) => sum + (exec.latency_ms || 0), 0);
    const totalLatencyLimitMs = executions.reduce((sum, exec) => sum + exec.latency_limit_ms, 0);

    return {
      task_id: taskId,
      phase_executions: executions,
      total_tokens_used: totalTokensUsed,
      total_tokens_limit: totalTokensLimit,
      total_latency_ms: totalLatencyMs,
      total_latency_limit_ms: totalLatencyLimitMs,
      cumulative_breach_status: this.calculateBreachStatus(
        totalTokensUsed,
        totalTokensLimit,
        totalLatencyMs,
        totalLatencyLimitMs
      ),
    };
  }

  /**
   * Calculate breach status
   */
  private calculateBreachStatus(
    tokensUsed: number,
    tokensLimit: number,
    latencyMs: number,
    latencyLimitMs: number
  ): BudgetBreachStatus {
    const tokenUtilization = tokensLimit > 0 ? tokensUsed / tokensLimit : 0;
    const latencyUtilization = latencyLimitMs > 0 ? latencyMs / latencyLimitMs : 0;

    const maxUtilization = Math.max(tokenUtilization, latencyUtilization);

    if (maxUtilization <= 1.0) {
      return 'within';
    } else if (maxUtilization <= 1.5) {
      return 'warning';
    } else {
      return 'exceeded';
    }
  }

  /**
   * Estimate tokens from text length (fallback when model doesn't report usage)
   */
  static estimateTokens(prompt: string, completion: string): number {
    return Math.ceil((prompt.length + completion.length) / 4);
  }

  /**
   * Clear executions for a task (for testing)
   */
  clearTaskExecutions(taskId: string): void {
    this.executions.delete(taskId);
    // Also clear current tracking if it matches
    if (this.currentTracking?.taskId === taskId) {
      this.currentTracking = undefined;
    }
  }

  /**
   * Get current tracking info (for debugging)
   */
  getCurrentTracking(): { taskId: string; phase: WorkPhase; tokensUsed: number } | null {
    if (!this.currentTracking) {
      return null;
    }
    return {
      taskId: this.currentTracking.taskId,
      phase: this.currentTracking.phase,
      tokensUsed: this.currentTracking.tokensUsed,
    };
  }
}

// Export singleton instance
export const phaseBudgetTracker = PhaseBudgetTracker.getInstance();
