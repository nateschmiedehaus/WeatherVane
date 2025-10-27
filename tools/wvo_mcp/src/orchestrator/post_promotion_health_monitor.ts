/**
 * Post-Promotion Health Monitor Integration
 *
 * Integrates RollbackMonitor into the orchestrator runtime.
 * Called after successful worker promotion to enable automatic health monitoring.
 *
 * Responsibilities:
 * - Initialize RollbackMonitor with orchestrator resources
 * - Start post-promotion monitoring
 * - Handle rollback/escalation events
 * - Record monitoring state in snapshots
 */

import { logError, logInfo, logWarning } from '../telemetry/logger.js';
import { withSpan } from '../telemetry/tracing.js';

import { RollbackMonitor, type RollbackDecision } from './rollback_monitor.js';

export interface PostPromotionMonitorOptions {
  workerManager: any; // WorkerManager instance
  operationsManager: any; // OperationsManager instance
  liveFlags: any; // LiveFlags instance
  artifactDir?: string; // Where to write monitoring reports
  onRollback?: (decision: RollbackDecision) => Promise<void>;
  onEscalation?: (decision: RollbackDecision) => Promise<void>;
}

export class PostPromotionHealthMonitor {
  private monitor: RollbackMonitor;
  private artifactDir: string;
  private onRollback?: (decision: RollbackDecision) => Promise<void>;
  private onEscalation?: (decision: RollbackDecision) => Promise<void>;
  private monitoringComplete = false;

  constructor(options: PostPromotionMonitorOptions) {
    this.monitor = new RollbackMonitor({
      workerManager: options.workerManager,
      operationsManager: options.operationsManager,
      liveFlags: options.liveFlags,
      checkIntervalMs: 30_000, // 30 seconds
      postPromotionGracePeriodMs: 600_000, // 10 minutes
      errorRateThreshold: 0.2, // 20%
      consecutiveFailureThreshold: 2, // 2+ consecutive failures
      checkWindowSize: 5, // Last 5 checks
    });

    this.artifactDir = options.artifactDir || 'state/analytics';
    this.onRollback = options.onRollback;
    this.onEscalation = options.onEscalation;

    this.setupEventHandlers();
  }

  /**
   * Start post-promotion monitoring.
   * Automatically stops after grace period or on explicit stop.
   */
  async startMonitoring(): Promise<void> {
    return withSpan('post_promotion_monitor.start', async () => {
      try {
        logInfo('Starting post-promotion health monitoring', {
          component: 'PostPromotionHealthMonitor',
          gracePeriodMs: 600_000,
        });

        await this.monitor.startPostPromotionMonitoring();
      } catch (err) {
        logError('Failed to start monitoring', {
          component: 'PostPromotionHealthMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });
        throw err;
      }
    });
  }

  /**
   * Stop monitoring (e.g., if manual override needed).
   */
  stopMonitoring(): void {
    this.monitor.stopMonitoring();
  }

  /**
   * Setup event handlers for rollback and escalation.
   */
  private setupEventHandlers(): void {
    this.monitor.on('rollback-executed', async (event: any) => {
      logError('Rollback executed - recording artifact', {
        component: 'PostPromotionHealthMonitor',
        event,
      });

      try {
        await this.recordRollbackArtifact(event);
        if (this.onRollback) {
          await this.onRollback(event.decision);
        }
      } catch (err) {
        logError('Failed to handle rollback event', {
          component: 'PostPromotionHealthMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    });

    this.monitor.on('escalation-triggered', async (event: any) => {
      logError('Escalation triggered - alerting on-call', {
        component: 'PostPromotionHealthMonitor',
        event,
      });

      try {
        await this.recordEscalationArtifact(event);
        if (this.onEscalation) {
          await this.onEscalation(event.decision);
        }
      } catch (err) {
        logError('Failed to handle escalation event', {
          component: 'PostPromotionHealthMonitor',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    });

    this.monitor.on('monitoring-stopped', (event: any) => {
      logInfo('Monitoring stopped', {
        component: 'PostPromotionHealthMonitor',
        checksPerformed: event.checksPerformed,
      });
      this.monitoringComplete = true;
    });

    this.monitor.on('health-check', (event: any) => {
      // Log health checks at debug level to avoid log spam
      if (event.decision?.decision !== 'healthy') {
        logWarning('Non-healthy health check', {
          component: 'PostPromotionHealthMonitor',
          decision: event.decision?.decision,
          errorRate: event.result?.errorRate,
        });
      }
    });
  }

  /**
   * Record rollback event to artifact file.
   */
  private async recordRollbackArtifact(event: any): Promise<void> {
    try {
      const { promises: fs } = await import('node:fs');
      const path = await import('node:path');

      const artifactPath = path.join(
        this.artifactDir,
        `rollback_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );

      await fs.writeFile(
        artifactPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            event_type: 'rollback_executed',
            decision: event.decision,
            result: event.result,
            monitoring_state: this.monitor.getState(),
            recent_checks: this.monitor.getRecentChecks(),
          },
          null,
          2
        )
      );

      logInfo('Recorded rollback artifact', {
        component: 'PostPromotionHealthMonitor',
        path: artifactPath,
      });
    } catch (err) {
      logWarning('Failed to record rollback artifact', {
        component: 'PostPromotionHealthMonitor',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  /**
   * Record escalation event to artifact file.
   */
  private async recordEscalationArtifact(event: any): Promise<void> {
    try {
      const { promises: fs } = await import('node:fs');
      const path = await import('node:path');

      const artifactPath = path.join(
        this.artifactDir,
        `escalation_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );

      await fs.writeFile(
        artifactPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            event_type: 'escalation_triggered',
            decision: event.decision,
            monitoring_state: this.monitor.getState(),
            recent_checks: this.monitor.getRecentChecks(),
            recommended_action: event.decision?.recommendedAction,
            oncall_alert: {
              severity: 'critical',
              message: `Post-promotion escalation: ${event.decision?.reason}`,
              action_required: 'Manual review and kill-switch reset',
            },
          },
          null,
          2
        )
      );

      logInfo('Recorded escalation artifact', {
        component: 'PostPromotionHealthMonitor',
        path: artifactPath,
      });
    } catch (err) {
      logWarning('Failed to record escalation artifact', {
        component: 'PostPromotionHealthMonitor',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  /**
   * Get current monitoring state.
   */
  getState() {
    return {
      ...this.monitor.getState(),
      monitoringComplete: this.monitoringComplete,
    };
  }

  /**
   * Get recent health checks.
   */
  getRecentChecks() {
    return this.monitor.getRecentChecks();
  }
}

/**
 * Factory function to create and start post-promotion monitor.
 * Typically called immediately after switchToCanary() succeeds.
 */
export async function startPostPromotionMonitoring(
  options: PostPromotionMonitorOptions
): Promise<PostPromotionHealthMonitor> {
  const monitor = new PostPromotionHealthMonitor(options);
  await monitor.startMonitoring();
  return monitor;
}

export default PostPromotionHealthMonitor;
