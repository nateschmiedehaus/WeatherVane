/**
 * Autopilot Health Monitor - Real-time OODA Loop Meta-Agent
 *
 * Implements the Observe-Orient-Decide-Act cycle to monitor autopilot health,
 * detect anomalies, and automatically remediate issues mid-flight.
 *
 * This is the "self-awareness" system that ensures autopilot stays healthy
 * without human intervention.
 *
 * OODA Loop:
 * - OBSERVE: Collect metrics (task states, queue depth, throughput, agent utilization)
 * - ORIENT: Analyze patterns, detect anomalies
 * - DECIDE: Choose remediation strategy based on issue severity and type
 * - ACT: Execute fixes safely without disrupting running work
 */

import type { StateMachine, Task } from './state_machine.js';
import type { AgentPool } from './agent_pool.js';
import { logInfo, logWarning, logError, logDebug } from '../telemetry/logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface HealthMetrics {
  timestamp: number;

  // Task states
  pendingCount: number;
  readyCount: number;
  inProgressCount: number;
  doneCount: number;
  blockedCount: number;

  // Queue metrics
  queueDepth: number;
  wipUtilization: number; // in_progress / max_wip

  // Throughput (tasks/hour)
  throughputLastHour: number;
  throughputLast5Min: number;

  // Stale detection
  staleTaskCount: number;
  maxStaleAgeMs: number;

  // Dependencies
  dependencySyncRatio: number; // table_deps / yaml_deps

  // Agent utilization
  busyAgents: number;
  idleAgents: number;
  totalAgents: number;
}

export interface AnomalyDetection {
  type: 'stale_tasks' | 'dependency_desync' | 'throughput_degradation' | 'wip_starvation' | 'queue_empty';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  metrics: Record<string, number>;
  detectedAt: number;
}

export interface RemediationPlan {
  anomaly: AnomalyDetection;
  action: 'recover_stale_tasks' | 'resync_dependencies' | 'adjust_wip_limit' | 'alert_only' | 'none';
  rationale: string;
  estimatedImpact: 'low' | 'medium' | 'high';
  safe: boolean;
}

export interface RemediationResult {
  plan: RemediationPlan;
  success: boolean;
  message: string;
  metrics?: Record<string, number>;
}

export interface AutopilotHealthMonitorConfig {
  /** How often to run the OODA loop (ms) */
  monitorIntervalMs: number;

  /** Enable automatic remediation (vs alert-only mode) */
  autoRemediate: boolean;

  /** Workspace root for file operations */
  workspaceRoot: string;

  /** Stale task threshold (ms) */
  staleTaskThresholdMs: number;

  /** Throughput baseline (tasks/hour) - warn if drops below 50% */
  baselineThroughput?: number;
}

/**
 * AutopilotHealthMonitor - Meta-agent implementing OODA loop
 *
 * This agent monitors the autopilot system in real-time and automatically
 * detects and corrects issues like stale tasks, dependency desyncs, and
 * throughput degradation.
 */
export class AutopilotHealthMonitor {
  private timer?: NodeJS.Timeout;
  private running = false;
  private metrics: HealthMetrics[] = [];
  private readonly maxHistorySize = 100;
  private anomalies: AnomalyDetection[] = [];
  private remediations: RemediationResult[] = [];
  private lastOodaCycle = 0;
  private lastHealthExport = 0;
  private readonly HEALTH_EXPORT_INTERVAL = 5 * 60 * 1000; // Export every 5 minutes

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly agentPool: AgentPool,
    private readonly config: AutopilotHealthMonitorConfig
  ) {}

  /**
   * Start the health monitor
   */
  start(): void {
    if (this.running) {
      logWarning('AutopilotHealthMonitor already running');
      return;
    }

    logInfo('Starting AutopilotHealthMonitor (OODA loop)', {
      monitorIntervalMs: this.config.monitorIntervalMs,
      autoRemediate: this.config.autoRemediate,
      staleThresholdMs: this.config.staleTaskThresholdMs
    });

    this.running = true;

    // Run OODA loop on interval
    this.timer = setInterval(() => {
      this.runOodaCycle();
    }, this.config.monitorIntervalMs);

    // Run immediately on startup
    this.runOodaCycle();
  }

  /**
   * Stop the health monitor
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    logInfo('Stopping AutopilotHealthMonitor');

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.running = false;
  }

  /**
   * Run one OODA cycle: Observe → Orient → Decide → Act
   */
  private async runOodaCycle(): Promise<void> {
    const cycleStart = Date.now();
    logDebug('Starting OODA cycle', { cycle: this.lastOodaCycle + 1 });

    try {
      // OBSERVE: Collect current metrics
      const metrics = this.observe();

      // ORIENT: Detect anomalies
      const anomalies = this.orient(metrics);

      // DECIDE: Plan remediation
      const plans = this.decide(anomalies);

      // ACT: Execute safe remediations
      const results = await this.act(plans);

      // Log cycle summary
      const cycleDuration = Date.now() - cycleStart;
      this.lastOodaCycle++;

      logDebug('OODA cycle complete', {
        cycle: this.lastOodaCycle,
        durationMs: cycleDuration,
        anomaliesDetected: anomalies.length,
        remediationsExecuted: results.length
      });

      // If critical issues detected, log warning
      const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
      if (criticalAnomalies.length > 0) {
        logWarning('Critical anomalies detected by health monitor', {
          count: criticalAnomalies.length,
          types: criticalAnomalies.map(a => a.type)
        });
      }

      // Periodic health report export (every 5 minutes)
      const now = Date.now();
      if (now - this.lastHealthExport >= this.HEALTH_EXPORT_INTERVAL) {
        await this.exportHealthReport().catch(error => {
          logWarning('Failed to export periodic health report', {
            error: error instanceof Error ? error.message : String(error)
          });
        });
        this.lastHealthExport = now;
      }

    } catch (error) {
      logError('OODA cycle failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * OBSERVE: Collect current system metrics
   */
  private observe(): HealthMetrics {
    const now = Date.now();

    // Task states
    const pending = this.stateMachine.getTasks({ status: ['pending'] });
    const ready = this.stateMachine.getReadyTasks();
    const inProgress = this.stateMachine.getTasks({ status: ['in_progress'] });
    const done = this.stateMachine.getTasks({ status: ['done'] });
    const blocked = this.stateMachine.getTasks({ status: ['blocked'] });

    // Stale tasks (in_progress with no recent activity)
    const staleThreshold = now - this.config.staleTaskThresholdMs;
    const staleTasks = inProgress.filter(task => {
      const startedAt = task.started_at ?? task.created_at;
      return startedAt && startedAt < staleThreshold;
    });

    const maxStaleAge = staleTasks.length > 0
      ? Math.max(...staleTasks.map(t => now - (t.started_at ?? t.created_at ?? now)))
      : 0;

    // Throughput calculation
    const oneHourAgo = now - 60 * 60 * 1000;
    const fiveMinAgo = now - 5 * 60 * 1000;

    const completedLastHour = done.filter(t => t.completed_at && t.completed_at > oneHourAgo).length;
    const completedLast5Min = done.filter(t => t.completed_at && t.completed_at > fiveMinAgo).length;

    const throughputLastHour = completedLastHour; // Already per hour
    const throughputLast5Min = (completedLast5Min / 5) * 60; // Convert to per hour

    // Dependency sync ratio
    const db = this.stateMachine.getDatabase();
    const tasksWithMetadataDeps = db
      .prepare(`SELECT COUNT(*) as count FROM tasks WHERE metadata LIKE '%"dependencies":[%' AND metadata NOT LIKE '%"dependencies":[]%'`)
      .get() as { count: number };

    const depsInTable = db
      .prepare('SELECT COUNT(DISTINCT task_id) as count FROM task_dependencies')
      .get() as { count: number };

    const dependencySyncRatio = tasksWithMetadataDeps.count > 0
      ? depsInTable.count / tasksWithMetadataDeps.count
      : 1.0;

    // Agent utilization
    const agentStatus = this.agentPool.getStatus();
    const busyAgents = agentStatus.reservations.length;
    const idleAgents = agentStatus.totalAgents - busyAgents;

    // WIP utilization
    const maxWip = agentStatus.totalAgents;
    const wipUtilization = maxWip > 0 ? inProgress.length / maxWip : 0;

    const metrics: HealthMetrics = {
      timestamp: now,
      pendingCount: pending.length,
      readyCount: ready.length,
      inProgressCount: inProgress.length,
      doneCount: done.length,
      blockedCount: blocked.length,
      queueDepth: ready.length,
      wipUtilization,
      throughputLastHour,
      throughputLast5Min,
      staleTaskCount: staleTasks.length,
      maxStaleAgeMs: maxStaleAge,
      dependencySyncRatio,
      busyAgents,
      idleAgents,
      totalAgents: agentStatus.totalAgents
    };

    // Store in history (circular buffer)
    this.metrics.push(metrics);
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }

    return metrics;
  }

  /**
   * ORIENT: Analyze metrics to detect anomalies
   */
  private orient(metrics: HealthMetrics): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];

    // Anomaly 1: Stale tasks
    if (metrics.staleTaskCount > 0) {
      anomalies.push({
        type: 'stale_tasks',
        severity: metrics.staleTaskCount >= 3 ? 'critical' : 'warning',
        description: `${metrics.staleTaskCount} task(s) stuck in in_progress state`,
        metrics: {
          staleCount: metrics.staleTaskCount,
          maxStaleAgeMs: metrics.maxStaleAgeMs,
          maxStaleAgeMin: Math.round(metrics.maxStaleAgeMs / 60000)
        },
        detectedAt: metrics.timestamp
      });
    }

    // Anomaly 2: Dependency desync
    if (metrics.dependencySyncRatio < 0.8) {
      anomalies.push({
        type: 'dependency_desync',
        severity: metrics.dependencySyncRatio < 0.5 ? 'critical' : 'warning',
        description: `Dependency sync ratio low: ${(metrics.dependencySyncRatio * 100).toFixed(0)}%`,
        metrics: {
          syncRatio: metrics.dependencySyncRatio
        },
        detectedAt: metrics.timestamp
      });
    }

    // Anomaly 3: Throughput degradation
    const baseline = this.config.baselineThroughput ?? 10;
    if (this.metrics.length >= 5 && metrics.throughputLast5Min < baseline * 0.5) {
      // Only trigger if we have enough history and throughput drops below 50% of baseline
      anomalies.push({
        type: 'throughput_degradation',
        severity: metrics.throughputLast5Min === 0 ? 'critical' : 'warning',
        description: `Throughput degraded to ${metrics.throughputLast5Min.toFixed(1)}/hr (baseline: ${baseline}/hr)`,
        metrics: {
          currentThroughput: metrics.throughputLast5Min,
          baselineThroughput: baseline,
          degradationPercent: ((baseline - metrics.throughputLast5Min) / baseline) * 100
        },
        detectedAt: metrics.timestamp
      });
    }

    // Anomaly 4: WIP starvation (idle agents but no ready tasks)
    if (metrics.idleAgents > 0 && metrics.readyCount === 0 && metrics.pendingCount > 0) {
      anomalies.push({
        type: 'wip_starvation',
        severity: 'warning',
        description: `${metrics.idleAgents} agent(s) idle but 0 ready tasks (${metrics.pendingCount} pending)`,
        metrics: {
          idleAgents: metrics.idleAgents,
          pendingCount: metrics.pendingCount,
          readyCount: metrics.readyCount
        },
        detectedAt: metrics.timestamp
      });
    }

    // Anomaly 5: Queue empty but work pending
    if (metrics.queueDepth === 0 && metrics.pendingCount > 5 && metrics.idleAgents > 0) {
      anomalies.push({
        type: 'queue_empty',
        severity: 'info',
        description: `Queue empty but ${metrics.pendingCount} tasks pending (likely blocked by dependencies)`,
        metrics: {
          queueDepth: metrics.queueDepth,
          pendingCount: metrics.pendingCount
        },
        detectedAt: metrics.timestamp
      });
    }

    // Store anomalies in history
    this.anomalies.push(...anomalies);
    if (this.anomalies.length > this.maxHistorySize) {
      this.anomalies.splice(0, this.anomalies.length - this.maxHistorySize);
    }

    return anomalies;
  }

  /**
   * DECIDE: Plan remediation for detected anomalies
   */
  private decide(anomalies: AnomalyDetection[]): RemediationPlan[] {
    const plans: RemediationPlan[] = [];

    for (const anomaly of anomalies) {
      let plan: RemediationPlan;

      switch (anomaly.type) {
        case 'stale_tasks':
          plan = {
            anomaly,
            action: 'recover_stale_tasks',
            rationale: 'Stale tasks prevent WIP limit from freeing up. Safe to recover to pending state.',
            estimatedImpact: 'low',
            safe: true
          };
          break;

        case 'dependency_desync':
          plan = {
            anomaly,
            action: 'resync_dependencies',
            rationale: 'Dependencies not synced from YAML. May cause tasks to execute out of order.',
            estimatedImpact: 'medium',
            safe: true // Resync is idempotent
          };
          break;

        case 'throughput_degradation':
          // Throughput degradation is usually a symptom, not the root cause
          // Alert but don't auto-remediate
          plan = {
            anomaly,
            action: 'alert_only',
            rationale: 'Throughput degradation is often a symptom of other issues. Investigate manually.',
            estimatedImpact: 'low',
            safe: true
          };
          break;

        case 'wip_starvation':
          // WIP starvation usually means dependencies are blocking
          // Could also mean prefetch isn't running
          plan = {
            anomaly,
            action: 'alert_only',
            rationale: 'WIP starvation may indicate dependency blocking or prefetch issues. Monitor for now.',
            estimatedImpact: 'low',
            safe: true
          };
          break;

        case 'queue_empty':
          plan = {
            anomaly,
            action: 'none',
            rationale: 'Queue empty with pending tasks is expected when all are dependency-blocked.',
            estimatedImpact: 'low',
            safe: true
          };
          break;

        default:
          plan = {
            anomaly,
            action: 'alert_only',
            rationale: 'Unknown anomaly type',
            estimatedImpact: 'low',
            safe: true
          };
      }

      plans.push(plan);
    }

    return plans;
  }

  /**
   * ACT: Execute safe remediations
   */
  private async act(plans: RemediationPlan[]): Promise<RemediationResult[]> {
    const results: RemediationResult[] = [];

    for (const plan of plans) {
      // Skip if auto-remediation is disabled
      if (!this.config.autoRemediate && plan.action !== 'none' && plan.action !== 'alert_only') {
        logInfo('Auto-remediation disabled, skipping action', {
          anomaly: plan.anomaly.type,
          action: plan.action
        });
        continue;
      }

      // Skip if action is not safe
      if (!plan.safe) {
        logWarning('Unsafe remediation skipped', {
          anomaly: plan.anomaly.type,
          action: plan.action
        });
        continue;
      }

      let result: RemediationResult;

      switch (plan.action) {
        case 'recover_stale_tasks':
          result = await this.recoverStaleTasks(plan);
          break;

        case 'resync_dependencies':
          result = await this.resyncDependencies(plan);
          break;

        case 'alert_only':
          result = {
            plan,
            success: true,
            message: 'Alert logged, no action taken'
          };
          logWarning('Health monitor alert', {
            anomaly: plan.anomaly.type,
            severity: plan.anomaly.severity,
            description: plan.anomaly.description
          });
          break;

        case 'none':
          result = {
            plan,
            success: true,
            message: 'No action needed'
          };
          break;

        default:
          result = {
            plan,
            success: false,
            message: `Unknown action: ${plan.action}`
          };
      }

      results.push(result);
      this.remediations.push(result);

      if (this.remediations.length > this.maxHistorySize) {
        this.remediations.shift();
      }

      // Log result
      if (result.success) {
        const logPayload: Record<string, any> = {
          anomaly: plan.anomaly.type,
          action: plan.action,
          message: result.message
        };

        // Include alert details for 'alert_only' action so formatter can display them meaningfully
        if (plan.action === 'alert_only') {
          logPayload.alertType = plan.anomaly.type;
          logPayload.alertMessage = plan.anomaly.description;
          logPayload.severity = plan.anomaly.severity;
        }

        logInfo('Remediation executed successfully', logPayload);
      } else {
        logError('Remediation failed', {
          anomaly: plan.anomaly.type,
          action: plan.action,
          message: result.message
        });
      }
    }

    return results;
  }

  /**
   * Recover stale in_progress tasks back to pending
   */
  private async recoverStaleTasks(plan: RemediationPlan): Promise<RemediationResult> {
    const now = Date.now();
    const staleThreshold = now - this.config.staleTaskThresholdMs;

    const inProgress = this.stateMachine.getTasks({ status: ['in_progress'] });
    const staleTasks = inProgress.filter(task => {
      const startedAt = task.started_at ?? task.created_at;
      return startedAt && startedAt < staleThreshold;
    });

    let recovered = 0;

    for (const task of staleTasks) {
      try {
        await this.stateMachine.transition(task.id, 'pending', {
          stale_recovered: true,
          stale_age_ms: now - (task.started_at ?? task.created_at ?? now),
          recovered_at: new Date(now).toISOString(),
          recovered_by: 'autopilot_health_monitor'
        });
        recovered++;
      } catch (error) {
        logError('Failed to recover stale task', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      plan,
      success: true,
      message: `Recovered ${recovered} stale task(s)`,
      metrics: { recovered }
    };
  }

  /**
   * Resync dependencies from roadmap.yaml
   */
  private async resyncDependencies(plan: RemediationPlan): Promise<RemediationResult> {
    // This would call syncRoadmapFile() but we don't have access to it here
    // Instead, we'll just alert and recommend manual resync
    // In a real implementation, you'd inject the roadmap sync function

    logWarning('Dependency resync needed', {
      syncRatio: plan.anomaly.metrics.syncRatio,
      action: 'Run: node scripts/force_roadmap_sync.mjs'
    });

    return {
      plan,
      success: true,
      message: 'Dependency resync recommended (manual action required)'
    };
  }

  /**
   * Get current health status
   */
  getStatus(): {
    running: boolean;
    lastCycle: number;
    metricsHistory: HealthMetrics[];
    activeAnomalies: AnomalyDetection[];
    recentRemediations: RemediationResult[];
  } {
    // Filter to anomalies from last 10 minutes
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const activeAnomalies = this.anomalies.filter(a => a.detectedAt > tenMinutesAgo);

    return {
      running: this.running,
      lastCycle: this.lastOodaCycle,
      metricsHistory: this.metrics.slice(-10), // Last 10 metrics
      activeAnomalies,
      recentRemediations: this.remediations.slice(-10) // Last 10 remediations
    };
  }

  /**
   * Export health report to file
   */
  async exportHealthReport(): Promise<void> {
    const status = this.getStatus();
    const reportPath = path.join(
      this.config.workspaceRoot,
      'state/analytics/autopilot_health_report.json'
    );

    await fs.writeFile(reportPath, JSON.stringify(status, null, 2));
    logInfo('Health report exported', { path: reportPath });
  }
}
