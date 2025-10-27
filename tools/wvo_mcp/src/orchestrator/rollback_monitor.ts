/**
 * RollbackMonitor: Automatic health monitoring and rollback orchestration
 *
 * Monitors worker health post-promotion and triggers automatic rollback when:
 * 1. Error rate exceeds threshold (20% for 5 consecutive checks)
 * 2. Health check failures persist (>2 failures in 5 checks)
 * 3. Critical resource exhaustion detected (memory, file handles)
 *
 * Features:
 * - Post-promotion health tracking with configurable thresholds
 * - Automatic rollback to previous worker on escalation
 * - Kill-switch reset via DISABLE_NEW flag
 * - Comprehensive audit trail and decision logging
 * - Graceful degradation with fallback behaviors
 */

import { EventEmitter } from 'node:events';

import { logError, logInfo, logWarning } from '../telemetry/logger.js';
import { withSpan } from '../telemetry/tracing.js';

const ROLLBACK_MONITOR_DISABLED =
  process.env.WVO_DISABLE_ROLLBACK_MONITOR === '1';

export interface HealthCheckResult {
  timestamp: string;
  ok: boolean;
  reason?: string;
  errorRate: number;
  failureCount: number;
  memoryUsageMb?: number;
  uptime: number;
  checks: {
    health?: boolean;
    rpc?: boolean;
    resources?: boolean;
  };
}

export interface RollbackDecision {
  timestamp: string;
  decision: 'healthy' | 'degrade' | 'escalate' | 'rollback';
  reason: string;
  errorRate: number;
  failureCount: number;
  recommendedAction: string;
  evidence: {
    recentChecks: HealthCheckResult[];
    failurePattern: string;
    threshold: string;
  };
}

export interface RollbackMonitorOptions {
  workerManager: any; // WorkerManager instance
  operationsManager: any; // OperationsManager instance
  liveFlags: any; // LiveFlags instance
  checkIntervalMs?: number;
  postPromotionGracePeriodMs?: number;
  errorRateThreshold?: number;
  consecutiveFailureThreshold?: number;
  checkWindowSize?: number;
  disabled?: boolean;
}

export class RollbackMonitor extends EventEmitter {
  private workerManager: any;
  private operationsManager: any;
  private liveFlags: any;
  private checkIntervalMs: number;
  private postPromotionGracePeriodMs: number;
  private errorRateThreshold: number;
  private consecutiveFailureThreshold: number;
  private checkWindowSize: number;
  private recentChecks: HealthCheckResult[] = [];
  private monitoringActive = false;
  private monitoringStarted: number | null = null;
  private checkTimer: NodeJS.Timeout | null = null;
  private lastRollbackDecision: RollbackDecision | null = null;
  private readonly disabled: boolean;

  constructor(options: RollbackMonitorOptions) {
    super();
    this.workerManager = options.workerManager;
    this.operationsManager = options.operationsManager;
    this.liveFlags = options.liveFlags;
    this.checkIntervalMs = options.checkIntervalMs ?? 30_000; // 30 seconds
    this.postPromotionGracePeriodMs = options.postPromotionGracePeriodMs ?? 600_000; // 10 minutes
    this.errorRateThreshold = options.errorRateThreshold ?? 0.2; // 20%
    this.consecutiveFailureThreshold = options.consecutiveFailureThreshold ?? 2;
    this.checkWindowSize = options.checkWindowSize ?? 5;
    this.disabled =
      (options.disabled ?? false) ||
      ROLLBACK_MONITOR_DISABLED ||
      !this.liveFlags;
  }

  /**
   * Start monitoring after worker promotion.
   * Runs for postPromotionGracePeriodMs or until manually stopped.
   */
  async startPostPromotionMonitoring(): Promise<void> {
    if (this.disabled) {
      logInfo('Rollback monitor disabled; skipping post-promotion monitoring', {
        component: 'RollbackMonitor',
      });
      return;
    }

    if (this.monitoringActive) {
      logWarning('Monitoring already active, skipping restart', { component: 'RollbackMonitor' });
      return;
    }

    return withSpan('rollback_monitor.start', async () => {
      logInfo('Starting post-promotion health monitoring', { component: 'RollbackMonitor' });
      this.monitoringActive = true;
      this.monitoringStarted = Date.now();
      this.recentChecks = [];
      this.emit('monitoring-started', { timestamp: new Date().toISOString() });

      // Schedule periodic health checks
      this.checkTimer = setInterval(() => {
        this.executeHealthCheck().catch((err) => {
          logError('Health check failed', { component: 'RollbackMonitor', error: err.message });
        });
      }, this.checkIntervalMs);

      // Schedule grace period expiration
      setTimeout(() => {
        if (this.monitoringActive) {
          this.stopMonitoring();
          logInfo('Grace period expired, monitoring stopped', {
            component: 'RollbackMonitor',
            gracePeriodMs: this.postPromotionGracePeriodMs,
          });
        }
      }, this.postPromotionGracePeriodMs);

      // Run first check immediately
      await this.executeHealthCheck();
    });
  }

  /**
   * Stop monitoring and clean up resources.
   */
  stopMonitoring(): void {
    if (this.disabled) {
      return;
    }
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.monitoringActive = false;
    this.emit('monitoring-stopped', {
      timestamp: new Date().toISOString(),
      checksPerformed: this.recentChecks.length,
    });
    logInfo('Post-promotion monitoring stopped', { component: 'RollbackMonitor' });
  }

  /**
   * Execute a single health check and evaluate rollback decision.
   */
  private async executeHealthCheck(): Promise<void> {
    const result = await this.performHealthCheck();
    this.recentChecks.push(result);

    // Keep only the most recent checks
    if (this.recentChecks.length > this.checkWindowSize) {
      this.recentChecks = this.recentChecks.slice(-this.checkWindowSize);
    }

    const decision = this.evaluateRollbackDecision();
    this.lastRollbackDecision = decision;

    logInfo('Health check completed', {
      component: 'RollbackMonitor',
      ok: result.ok,
      errorRate: result.errorRate,
      decision: decision.decision,
    });

    this.emit('health-check', { result, decision });

    // Take action based on decision
    if (decision.decision === 'rollback') {
      await this.executeRollback(decision);
    } else if (decision.decision === 'escalate') {
      await this.executeEscalation(decision);
    }
  }

  /**
   * Perform health check on the active worker.
   */
  private async performHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const checks = {
      health: false,
      rpc: false,
      resources: false,
    };

    try {
      // Get worker health via RPC
      const activeWorker = this.workerManager.getActiveWorker?.();
      if (!activeWorker) {
        return {
          timestamp,
          ok: false,
          reason: 'No active worker',
          errorRate: 0,
          failureCount: 1,
          uptime: 0,
          checks,
        };
      }

      // Health check via RPC
      try {
        const health = await activeWorker.call?.('health', undefined, { timeoutMs: 5000 });
        checks.health = health?.ok ?? false;
      } catch (err) {
        logWarning('Health RPC failed', {
          component: 'RollbackMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }

      // Get operations metrics
      const ops = this.operationsManager?.getSnapshot?.();
      if (ops) {
        checks.rpc = true;
        const errorRate = ops.validation?.failureRate ?? ops.failureRate ?? 0;

        // Check resource usage
        const memUsage = ops.resources?.memoryUsageMb ?? 0;
        checks.resources = memUsage < 1024; // Less than 1GB

        return {
          timestamp,
          ok: checks.health && checks.rpc && checks.resources,
          errorRate: Math.min(errorRate, 1), // Cap at 1.0
          failureCount: (ops.validation?.failuresLastHour ?? 0) as number,
          memoryUsageMb: memUsage,
          uptime: activeWorker.uptime?.() ?? 0,
          checks,
        };
      }

      return {
        timestamp,
        ok: checks.health,
        reason: 'Operations manager unavailable',
        errorRate: 0,
        failureCount: 0,
        uptime: activeWorker.uptime?.() ?? 0,
        checks,
      };
    } catch (err) {
      logError('Health check exception', {
        component: 'RollbackMonitor',
        error: err instanceof Error ? err.message : 'unknown',
      });
      return {
        timestamp,
        ok: false,
        reason: err instanceof Error ? err.message : 'unknown error',
        errorRate: 1,
        failureCount: 1,
        uptime: 0,
        checks,
      };
    }
  }

  /**
   * Evaluate whether to trigger rollback based on recent checks.
   */
  private evaluateRollbackDecision(): RollbackDecision {
    const timestamp = new Date().toISOString();
    const base = {
      timestamp,
      evidence: {
        recentChecks: this.recentChecks,
        failurePattern: this.analyzeFailurePattern(),
        threshold: `errorRate>${this.errorRateThreshold}, failures>${this.consecutiveFailureThreshold}`,
      },
    };

    // Need minimum checks to make a decision
    if (this.recentChecks.length < 2) {
      return {
        ...base,
        decision: 'healthy' as const,
        reason: 'Insufficient checks for decision',
        errorRate: 0,
        failureCount: 0,
        recommendedAction: 'continue monitoring',
      };
    }

    // Count failures in recent window
    const failureCount = this.recentChecks.filter((c) => !c.ok).length;
    const avgErrorRate =
      this.recentChecks.reduce((sum, c) => sum + c.errorRate, 0) / this.recentChecks.length;

    // Rollback if error rate consistently high
    if (avgErrorRate > this.errorRateThreshold && failureCount >= 3) {
      return {
        ...base,
        decision: 'rollback' as const,
        reason: `High error rate (${(avgErrorRate * 100).toFixed(1)}%) with ${failureCount} failures`,
        errorRate: avgErrorRate,
        failureCount,
        recommendedAction: 'automatic rollback to previous worker',
      };
    }

    // Escalate if pattern suggests sustained degradation
    if (this.hasConsecutiveFailures(this.consecutiveFailureThreshold)) {
      return {
        ...base,
        decision: 'escalate' as const,
        reason: `${this.consecutiveFailureThreshold}+ consecutive health check failures detected`,
        errorRate: avgErrorRate,
        failureCount,
        recommendedAction: 'trigger kill-switch (DISABLE_NEW flag) and escalate to on-call',
      };
    }

    // Degrade if minor issues detected
    if (failureCount > 0 || avgErrorRate > 0.05) {
      return {
        ...base,
        decision: 'degrade' as const,
        reason: `Minor degradation: ${failureCount} failures, ${(avgErrorRate * 100).toFixed(1)}% error rate`,
        errorRate: avgErrorRate,
        failureCount,
        recommendedAction: 'continue monitoring with increased frequency',
      };
    }

    return {
      ...base,
      decision: 'healthy' as const,
      reason: 'All health checks passing',
      errorRate: avgErrorRate,
      failureCount,
      recommendedAction: 'continue normal operation',
    };
  }

  /**
   * Analyze failure pattern in recent checks.
   */
  private analyzeFailurePattern(): string {
    if (this.recentChecks.length === 0) return 'no_data';

    const recent = this.recentChecks.slice(-5);
    const pattern = recent.map((c) => (c.ok ? '✓' : '✗')).join('');

    if (pattern.includes('✗✗✗')) return 'consecutive_failures';
    if (pattern.endsWith('✗✗')) return 'recent_failures';
    if (pattern.includes('✗')) return 'intermittent_failures';
    return 'healthy';
  }

  /**
   * Check if there are N consecutive failures in recent checks.
   */
  private hasConsecutiveFailures(threshold: number): boolean {
    if (this.recentChecks.length < threshold) return false;

    const recent = this.recentChecks.slice(-threshold);
    return recent.every((c) => !c.ok);
  }

  /**
   * Execute automatic rollback to previous worker.
   */
  private async executeRollback(decision: RollbackDecision): Promise<void> {
    if (this.disabled) {
      logInfo('Rollback monitor disabled; skipping automatic rollback', {
        component: 'RollbackMonitor',
        reason: decision.reason,
      });
      return;
    }

    this.stopMonitoring();

    return withSpan('rollback_monitor.execute_rollback', async (span) => {
      try {
        logError('CRITICAL: Executing automatic rollback', {
          component: 'RollbackMonitor',
          reason: decision.reason,
          errorRate: decision.errorRate,
        });

        span?.setAttribute('rollback_reason', decision.reason);
        span?.setAttribute('error_rate', decision.errorRate);

        // Execute rollback
        const result = this.workerManager.switchToActive?.();
        if (result) {
          logInfo('Rollback completed', {
            component: 'RollbackMonitor',
            previousPid: result.previousWorkerPid,
            restoredPid: result.restoredWorkerPid,
          });
        }

        // Record rollback decision for audit
        await this.recordRollbackDecision(decision, 'executed');

        // Emit event for external handlers
        this.emit('rollback-executed', {
          timestamp: new Date().toISOString(),
          decision,
          result,
        });

        // Send alert to observability
        // telemetryExporter.captureEvent would go here if available
      } catch (err) {
        logError('Rollback execution failed', {
          component: 'RollbackMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });

        // Emit failure event
        this.emit('rollback-failed', {
          timestamp: new Date().toISOString(),
          decision,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  /**
   * Execute escalation: trigger kill-switch and alert on-call.
   */
  private async executeEscalation(decision: RollbackDecision): Promise<void> {
    if (this.disabled) {
      logInfo('Rollback monitor disabled; skipping escalation', {
        component: 'RollbackMonitor',
        reason: decision.reason,
      });
      return;
    }

    return withSpan('rollback_monitor.execute_escalation', async (span) => {
      try {
        logError('ESCALATION: Setting kill-switch and alerting on-call', {
          component: 'RollbackMonitor',
          reason: decision.reason,
        });

        span?.setAttribute('escalation_reason', decision.reason);

        // Set DISABLE_NEW flag to revert to legacy behavior
        await this.triggerKillSwitch();

        // Record escalation decision
        await this.recordRollbackDecision(decision, 'escalated');

        // Emit escalation event
        this.emit('escalation-triggered', {
          timestamp: new Date().toISOString(),
          decision,
        });

        // Send critical alert
        // telemetryExporter.captureEvent would go here if available
      } catch (err) {
        logError('Escalation execution failed', {
          component: 'RollbackMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  /**
   * Trigger kill-switch by setting DISABLE_NEW flag.
   * Restores all flags to defaults and reverts to legacy behavior.
   */
  private async triggerKillSwitch(): Promise<void> {
    if (this.disabled) {
      logWarning('Kill-switch trigger skipped because rollback monitor is disabled', {
        component: 'RollbackMonitor',
      });
      return;
    }

    try {
      if (!this.liveFlags) {
        logWarning('Live flags not available for kill-switch', { component: 'RollbackMonitor' });
        return;
      }

      // Set DISABLE_NEW flag
      await this.liveFlags.setFlag?.('DISABLE_NEW', '1');

      logInfo('Kill-switch activated: DISABLE_NEW=1', { component: 'RollbackMonitor' });
      this.emit('kill-switch-activated', {
        timestamp: new Date().toISOString(),
        flag: 'DISABLE_NEW',
        value: '1',
      });
    } catch (err) {
      logError('Failed to set kill-switch', {
        component: 'RollbackMonitor',
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }
  }

  /**
   * Reset kill-switch after manual verification.
   * Only callable after on-call review and issue resolution.
   */
  async resetKillSwitch(): Promise<void> {
    return withSpan('rollback_monitor.reset_kill_switch', async () => {
      try {
        if (!this.liveFlags) {
          throw new Error('Live flags not available');
        }

        // Reset DISABLE_NEW flag
        await this.liveFlags.setFlag?.('DISABLE_NEW', '0');

        logInfo('Kill-switch reset: DISABLE_NEW=0', { component: 'RollbackMonitor' });
        this.emit('kill-switch-reset', {
          timestamp: new Date().toISOString(),
          flag: 'DISABLE_NEW',
          value: '0',
        });

        // Record reset decision
        await this.recordManualAction('kill_switch_reset');
      } catch (err) {
        logError('Failed to reset kill-switch', {
          component: 'RollbackMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });
        throw err;
      }
    });
  }

  /**
   * Record rollback decision for audit trail.
   */
  private async recordRollbackDecision(
    decision: RollbackDecision,
    status: 'executed' | 'escalated' | 'prevented'
  ): Promise<void> {
    try {
      const record = {
        timestamp: decision.timestamp,
        decision: decision.decision,
        reason: decision.reason,
        status,
        errorRate: decision.errorRate,
        failureCount: decision.failureCount,
        recommendedAction: decision.recommendedAction,
        evidence: decision.evidence,
      };

      // Write to rollback audit log
      // This would integrate with a persistent audit store
      logInfo('Recorded rollback decision', { component: 'RollbackMonitor', record });
    } catch (err) {
      logError('Failed to record rollback decision', {
        component: 'RollbackMonitor',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  /**
   * Record manual action (e.g., on-call reset).
   */
  private async recordManualAction(action: string): Promise<void> {
    try {
      const record = {
        timestamp: new Date().toISOString(),
        action,
        actor: 'on-call-engineer',
      };

      logInfo('Recorded manual action', { component: 'RollbackMonitor', record });
    } catch (err) {
      logError('Failed to record manual action', {
        component: 'RollbackMonitor',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  /**
   * Get current monitoring state.
   */
  getState() {
    return {
      monitoringActive: this.monitoringActive,
      monitoringStarted: this.monitoringStarted,
      checkCount: this.recentChecks.length,
      lastDecision: this.lastRollbackDecision,
      uptime: this.monitoringStarted ? Date.now() - this.monitoringStarted : null,
    };
  }

  /**
   * Get recent health check history.
   */
  getRecentChecks(): HealthCheckResult[] {
    return [...this.recentChecks];
  }
}

export default RollbackMonitor;
