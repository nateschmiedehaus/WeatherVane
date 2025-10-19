/**
 * OrchestratorLoop - Main coordination loop for autonomous execution
 *
 * This class provides a single, clean interface for orchestrating all
 * autonomous activities. It replaces the scattered logic in autopilot.sh
 * with a testable, observable TypeScript implementation.
 *
 * Based on architecture refactor Phase 1: Extract Core Loop
 * See: /tmp/architecture_critique_synthesis.md lines 285-329
 *
 * Philosophy:
 * - Single place to understand "what happens next"
 * - Everything else is implementation details (policy, executor, critics)
 * - Emit events for observability
 * - Fail gracefully with detailed telemetry
 */

import { PolicyEngine, type OrchestratorAction } from './policy_engine.js';
import type { StateMachine } from './state_machine.js';
import type { TaskScheduler } from './task_scheduler.js';
import type { QualityMonitor } from './quality_monitor.js';
import type { Task } from './state_machine.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { EventEmitter } from 'node:events';

/**
 * OrchestratorEvent - Events emitted by the orchestrator
 */
export interface OrchestratorEvent {
  timestamp: number;
  type: 'tick' | 'decision' | 'action' | 'error' | 'idle' | 'stopped';
  data?: Record<string, unknown>;
}

/**
 * ExecutionResult - Result of executing an action
 */
export interface ExecutionResult {
  success: boolean;
  action: OrchestratorAction;
  duration: number;
  error?: Error;
  details?: Record<string, unknown>;
}

/**
 * OrchestratorLoopOptions - Configuration options
 */
export interface OrchestratorLoopOptions {
  /**
   * Enable dry-run mode (no actual execution)
   */
  dryRun?: boolean;

  /**
   * Tick interval in milliseconds
   */
  tickInterval?: number;

  /**
   * Maximum consecutive idle ticks (no pending tasks) before the orchestrator stops itself.
   * Prevents looping forever when the roadmap has no runnable work.
   */
  maxIdleTicksBeforeStop?: number;

  /**
   * Maximum errors before stopping
   */
  maxErrors?: number;

  /**
   * Error window in milliseconds
   */
  errorWindow?: number;

  /**
   * Enable telemetry events
   */
  enableTelemetry?: boolean;
}

/**
 * OrchestratorLoop - Main coordination loop
 *
 * Responsibilities:
 * - Decide what to do next (via PolicyEngine)
 * - Execute actions safely
 * - Emit events for observability
 * - Handle errors gracefully
 * - Provide clean start/stop interface
 */
export class OrchestratorLoop extends EventEmitter {
  private readonly policy: PolicyEngine;
  private readonly options: Required<OrchestratorLoopOptions>;
  private running = false;
  private tickCount = 0;
  private errorCount = 0;
  private lastErrors: number[] = [];
  private tickTimer?: NodeJS.Timeout;
  private consecutiveIdleTicks = 0;
  private currentTickInterval: number;
  private lastIdleReason: string | null = null;

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly scheduler: TaskScheduler,
    private readonly qualityMonitor: QualityMonitor,
    options: OrchestratorLoopOptions = {}
  ) {
    super();
    this.policy = new PolicyEngine(stateMachine, {
      dryRun: options.dryRun,
    });
    this.options = {
      dryRun: options.dryRun ?? false,
      tickInterval: options.tickInterval ?? 30000, // 30 seconds
      maxIdleTicksBeforeStop: options.maxIdleTicksBeforeStop ?? 8,
      maxErrors: options.maxErrors ?? 5,
      errorWindow: options.errorWindow ?? 300000, // 5 minutes
      enableTelemetry: options.enableTelemetry ?? true,
    };
    this.currentTickInterval = this.options.tickInterval;
  }

  /**
   * Start the orchestrator loop
   */
  async start(): Promise<void> {
    if (this.running) {
      logWarning('OrchestratorLoop already running');
      return;
    }

    logInfo('Starting OrchestratorLoop', {
      dryRun: this.options.dryRun,
      tickInterval: this.options.tickInterval,
    });

    this.running = true;
    this.tickCount = 0;
    this.errorCount = 0;
    this.lastErrors = [];
    this.consecutiveIdleTicks = 0;
    this.currentTickInterval = this.options.tickInterval;
    this.lastIdleReason = null;

    // Start the main loop
    this.scheduleTick();
  }

  /**
   * Stop the orchestrator loop
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logInfo('Stopping OrchestratorLoop', {
      totalTicks: this.tickCount,
      errors: this.errorCount,
    });

    this.running = false;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }

    this.emitEvent({
      timestamp: Date.now(),
      type: 'stopped',
      data: {
        totalTicks: this.tickCount,
        errors: this.errorCount,
      },
    });
  }

  /**
   * Execute one tick of the orchestrator loop
   */
  async tick(): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.tickCount++;

    this.emitEvent({
      timestamp: startTime,
      type: 'tick',
      data: { tickNumber: this.tickCount },
    });

    try {
      // 1. Get current system state
      const state = this.policy.getSystemState();

      // 2. Decide what to do
      const decision = this.policy.decide(state);

      this.emitEvent({
        timestamp: Date.now(),
        type: 'decision',
        data: {
          decision,
          state,
        },
      });

      // 3. Execute the action
      const result = await this.executeAction(decision);

      // 4. Record telemetry
      if (this.options.enableTelemetry) {
        await this.recordTelemetry(decision, result);
      }

      // 5. Track idle state for intelligent backoff
      const idleReason =
        decision.type === 'idle'
          ? decision.reason ?? null
          : decision.type === 'wait'
            ? decision.reason ?? null
            : null;

      if (decision.type === 'idle' || decision.type === 'wait') {
        this.consecutiveIdleTicks++;
        if (idleReason) {
          this.lastIdleReason = idleReason;
        }
      } else {
        // Active work - reset idle counter
        this.consecutiveIdleTicks = 0;
        this.currentTickInterval = this.options.tickInterval;
        this.lastIdleReason = null;
      }

      if (
        this.lastIdleReason === 'no_pending_tasks' &&
        this.consecutiveIdleTicks >= this.options.maxIdleTicksBeforeStop
      ) {
        await this.enterSleepMode(this.lastIdleReason, decision);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);

      return {
        success: false,
        action: { type: 'idle', reason: 'error' },
        duration: Date.now() - startTime,
        error: err,
      };
    } finally {
      // Schedule next tick if still running
      if (this.running) {
        this.scheduleTick();
      }
    }
  }

  /**
   * Execute an orchestrator action
   */
  private async executeAction(action: OrchestratorAction): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      logInfo(`Executing action: ${action.type}`, { action });

      if (this.options.dryRun) {
        logInfo('[DRY-RUN] Would execute action', { action });
        return {
          success: true,
          action,
          duration: Date.now() - startTime,
          details: { dryRun: true },
        };
      }

      // Execute based on action type
      switch (action.type) {
        case 'run_task':
          await this.executeTask(action.task);
          break;

        case 'run_critic':
          await this.executeCritic(action.critic, action.category);
          break;

        case 'restart_worker':
          await this.restartWorker(action.reason);
          break;

        case 'escalate':
          await this.escalateIssue(action.issue, action.severity);
          break;

        case 'wait':
          await this.sleep(action.duration);
          break;

        case 'idle':
          // Nothing to do
          break;

        default:
          logWarning('Unknown action type', { action });
      }

      this.emitEvent({
        timestamp: Date.now(),
        type: 'action',
        data: { action, success: true },
      });

      return {
        success: true,
        action,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logError(`Action execution failed: ${err.message}`, { action, error: err.stack });

      this.emitEvent({
        timestamp: Date.now(),
        type: 'error',
        data: { action, error: err.message },
      });

      return {
        success: false,
        action,
        duration: Date.now() - startTime,
        error: err,
      };
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(task: Task): Promise<void> {
    logInfo(`Executing task: ${task.id}`, { task });

    // Mark task as in progress
    await this.stateMachine.transition(task.id, 'in_progress');

    // TODO: Integrate with actual task executor
    // For now, this is a placeholder
    await this.sleep(100);

    // Mark as completed (placeholder)
    await this.stateMachine.transition(task.id, 'done');
  }

  /**
   * Execute a critic
   */
  private async executeCritic(critic: string, category?: string): Promise<void> {
    logInfo(`Running critic: ${critic}`, { category });

    // TODO: Integrate with QualityMonitor/Critics system
    // For now, this is a placeholder that just logs
    await this.sleep(100);
  }

  /**
   * Restart worker
   */
  private async restartWorker(reason: string): Promise<void> {
    logWarning('Worker restart requested', { reason });

    // TODO: Integrate with WorkerManager
    // For now, this is a placeholder that just logs
    await this.sleep(100);
  }

  /**
   * Escalate an issue
   */
  private async escalateIssue(issue: string, severity: string): Promise<void> {
    logError(`Escalation requested: ${issue}`, { severity });

    // TODO: Integrate with escalation system
    // For now, just record in state machine
    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'escalation',
      content: issue,
      confidence: 1.0,
      metadata: { severity },
    });
  }

  /**
   * Sleep for specified duration
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Schedule the next tick with intelligent backoff
   *
   * Strategy:
   * - Active work: Use base interval (30s)
   * - 1 idle tick: 30s (give work a chance to arrive)
   * - 2 idle ticks: 1 minute
   * - 3 idle ticks: 2 minutes
   * - 4+ idle ticks: 5 minutes (max backoff)
   *
   * This prevents burning CPU when no work is available while still
   * being responsive when work appears.
   */
  private scheduleTick(): void {
    if (!this.running) {
      return;
    }

    if (
      this.lastIdleReason === 'no_pending_tasks' &&
      this.consecutiveIdleTicks >= this.options.maxIdleTicksBeforeStop
    ) {
      return;
    }

    // Calculate backoff interval
    if (this.consecutiveIdleTicks <= 1) {
      // First idle tick - keep base interval
      this.currentTickInterval = this.options.tickInterval;
    } else {
      // Exponential backoff: 30s → 1m → 2m → 5m (max)
      const backoffMultiplier = Math.pow(2, this.consecutiveIdleTicks - 1);
      const backoffInterval = this.options.tickInterval * backoffMultiplier;
      const maxInterval = 300000; // 5 minutes cap
      this.currentTickInterval = Math.min(backoffInterval, maxInterval);
    }

    if (this.consecutiveIdleTicks >= 2) {
      logInfo(`Orchestrator idle (${this.consecutiveIdleTicks} ticks), backing off to ${Math.round(this.currentTickInterval / 1000)}s`, {
        consecutiveIdle: this.consecutiveIdleTicks,
        nextTickMs: this.currentTickInterval,
      });
    }

    this.tickTimer = setTimeout(() => {
      void this.tick();
    }, this.currentTickInterval);
  }

  /**
   * Handle an error
   */
  private handleError(error: Error): void {
    const now = Date.now();
    this.errorCount++;
    this.lastErrors.push(now);

    // Remove old errors outside the window
    this.lastErrors = this.lastErrors.filter(
      t => now - t < this.options.errorWindow
    );

    logError(`Orchestrator error: ${error.message}`, {
      errorCount: this.errorCount,
      recentErrors: this.lastErrors.length,
      error: error.stack,
    });

    // Stop if too many recent errors
    if (this.lastErrors.length >= this.options.maxErrors) {
      logError(`Too many errors, stopping orchestrator: ${error.message}`, {
        maxErrors: this.options.maxErrors,
        errorWindow: this.options.errorWindow,
        error: error.stack,
      });
      void this.stop();
    }

    this.emitEvent({
      timestamp: now,
      type: 'error',
      data: {
        error: error.message,
        stack: error.stack,
        errorCount: this.errorCount,
        recentErrors: this.lastErrors.length,
      },
    });
  }

  /**
   * Emit a telemetry event
   */
  private emitEvent(event: OrchestratorEvent): void {
    if (!this.options.enableTelemetry) {
      return;
    }

    this.emit('event', event);
  }

  /**
   * Record telemetry for an action
   */
  private async recordTelemetry(
    action: OrchestratorAction,
    result: ExecutionResult
  ): Promise<void> {
    try {
      // Record decision in state machine
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: 'orchestrator_action',
        content: `Action: ${action.type}`,
        confidence: result.success ? 1.0 : 0.0,
        metadata: {
          action,
          result,
        },
      });
    } catch (error) {
      // Don't let telemetry errors crash the orchestrator
      logWarning('Telemetry recording failed', { error });
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    running: boolean;
    tickCount: number;
    errorCount: number;
    recentErrors: number;
    consecutiveIdleTicks: number;
    currentTickInterval: number;
    lastIdleReason: string | null;
    config: Required<OrchestratorLoopOptions>;
  } {
    return {
      running: this.running,
      tickCount: this.tickCount,
      errorCount: this.errorCount,
      recentErrors: this.lastErrors.length,
      consecutiveIdleTicks: this.consecutiveIdleTicks,
      currentTickInterval: this.currentTickInterval,
      lastIdleReason: this.lastIdleReason,
      config: this.options,
    };
  }

  /**
   * Check if orchestrator is running
   */
  isRunning(): boolean {
    return this.running;
  }

  private async enterSleepMode(reason: string, decision: OrchestratorAction): Promise<void> {
    logInfo('No pending tasks detected; entering sleep mode', {
      consecutiveIdleTicks: this.consecutiveIdleTicks,
      maxIdleTicksBeforeStop: this.options.maxIdleTicksBeforeStop,
    });

    this.emitEvent({
      timestamp: Date.now(),
      type: 'idle',
      data: {
        reason: `${reason}_sleep`,
        consecutiveIdle: this.consecutiveIdleTicks,
      },
    });

    try {
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: 'orchestrator_sleep',
        content: `Stopped orchestrator after ${this.consecutiveIdleTicks} idle ticks (${reason})`,
        confidence: 1.0,
        metadata: {
          reason,
          consecutiveIdleTicks: this.consecutiveIdleTicks,
          lastDecision: decision,
        },
      });
    } catch (error) {
      logWarning('Telemetry recording failed for sleep entry', { error });
    }

    await this.stop();
  }
}
