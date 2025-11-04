/**
 * Metrics Collector
 *
 * Collects and aggregates performance metrics for the orchestrator system.
 * Provides real-time visibility into system health and performance.
 *
 * Connection to WeatherVane Purpose:
 * - Monitors forecast pipeline throughput for energy trading SLAs
 * - Tracks error rates to maintain <5% forecast error target
 * - Provides observability for 24/7 weather data ingestion
 */

import { EventEmitter } from 'events';
import { logInfo, logWarning } from '../telemetry/logger.js';
import type { StateMachine, Task, RoadmapHealth } from './state_machine.js';
import type { TaskScheduler, QueueMetrics } from './task_scheduler.js';
import type { OrchestratorLoop } from './orchestrator_loop.js';

export interface MetricSnapshot {
  timestamp: number;
  throughput: {
    tasksPerHour: number;
    tasksPerMinute: number;
    completedLast24h: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
  errorRate: {
    percentage: number;
    failedLast24h: number;
    totalLast24h: number;
  };
  queue: {
    depth: number;
    oldestTaskAge: number;
    blockedTasks: number;
  };
  resources: {
    memoryUsageMB: number;
    cpuPercentage: number;
    uptime: number;
  };
  mcp: {
    syncSuccess: number;
    syncFailures: number;
    lastSyncTime: number;
  };
}

export interface PerformanceAlert {
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export class MetricsCollector extends EventEmitter {
  private taskLatencies: number[] = [];
  private taskCompletions: Array<{ taskId: string; timestamp: number; success: boolean }> = [];
  private mcpSyncAttempts: Array<{ timestamp: number; success: boolean }> = [];
  private startTime: number = Date.now();
  private lastSnapshot?: MetricSnapshot;

  // Thresholds for alerts
  private readonly LATENCY_P95_THRESHOLD = 30000; // 30 seconds
  private readonly ERROR_RATE_THRESHOLD = 0.05; // 5%
  private readonly QUEUE_DEPTH_THRESHOLD = 100;
  private readonly MEMORY_THRESHOLD_MB = 500;

  // Retention settings
  private readonly MAX_LATENCY_SAMPLES = 1000;
  private readonly RETENTION_PERIOD = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly scheduler?: TaskScheduler
  ) {
    super();
    this.startPeriodicCleanup();
  }

  /**
   * Record task completion
   */
  recordTaskCompletion(taskId: string, latencyMs: number, success: boolean): void {
    // Record latency
    this.taskLatencies.push(latencyMs);
    if (this.taskLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.taskLatencies.shift();
    }

    // Record completion
    this.taskCompletions.push({
      taskId,
      timestamp: Date.now(),
      success
    });

    // Check for performance degradation
    if (!success) {
      this.checkErrorRate();
    }

    if (latencyMs > this.LATENCY_P95_THRESHOLD) {
      this.emitAlert({
        severity: 'warning',
        metric: 'task_latency',
        message: `Task ${taskId} took ${Math.round(latencyMs / 1000)}s to complete`,
        value: latencyMs,
        threshold: this.LATENCY_P95_THRESHOLD,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Record MCP sync attempt
   */
  recordMCPSync(success: boolean): void {
    this.mcpSyncAttempts.push({
      timestamp: Date.now(),
      success
    });

    // Check MCP health
    const recentAttempts = this.mcpSyncAttempts.filter(
      a => Date.now() - a.timestamp < 3600000 // Last hour
    );

    if (recentAttempts.length > 10) {
      const successRate = recentAttempts.filter(a => a.success).length / recentAttempts.length;
      if (successRate < 0.8) {
        this.emitAlert({
          severity: 'warning',
          metric: 'mcp_sync_rate',
          message: 'MCP sync success rate below 80%',
          value: successRate,
          threshold: 0.8,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Collect current metrics snapshot
   */
  async collectSnapshot(): Promise<MetricSnapshot> {
    const now = Date.now();
    const health = this.stateMachine.getRoadmapHealth();
    const queueMetrics = this.scheduler?.getQueueMetrics();

    // Calculate throughput
    const last24h = this.taskCompletions.filter(t => now - t.timestamp < this.RETENTION_PERIOD);
    const lastHour = this.taskCompletions.filter(t => now - t.timestamp < 3600000);
    const lastMinute = this.taskCompletions.filter(t => now - t.timestamp < 60000);

    // Calculate latency percentiles
    const sortedLatencies = [...this.taskLatencies].sort((a, b) => a - b);
    const p50 = this.getPercentile(sortedLatencies, 50);
    const p95 = this.getPercentile(sortedLatencies, 95);
    const p99 = this.getPercentile(sortedLatencies, 99);
    const mean = sortedLatencies.length > 0
      ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
      : 0;

    // Calculate error rate
    const failed24h = last24h.filter(t => !t.success).length;
    const errorRate = last24h.length > 0 ? failed24h / last24h.length : 0;

    // Get resource usage
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // MCP metrics
    const mcpSuccesses = this.mcpSyncAttempts.filter(a => a.success).length;
    const mcpFailures = this.mcpSyncAttempts.filter(a => !a.success).length;
    const lastMCPSync = this.mcpSyncAttempts.length > 0
      ? this.mcpSyncAttempts[this.mcpSyncAttempts.length - 1].timestamp
      : 0;

    const snapshot: MetricSnapshot = {
      timestamp: now,
      throughput: {
        tasksPerHour: lastHour.length,
        tasksPerMinute: lastMinute.length,
        completedLast24h: last24h.length
      },
      latency: {
        p50,
        p95,
        p99,
        mean
      },
      errorRate: {
        percentage: errorRate,
        failedLast24h: failed24h,
        totalLast24h: last24h.length
      },
      queue: {
        depth: queueMetrics?.size || 0,
        oldestTaskAge: 0,  // TODO: Calculate from actual queue tasks
        blockedTasks: health.blockedTasks
      },
      resources: {
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        cpuPercentage: this.calculateCPUPercentage(cpuUsage),
        uptime: now - this.startTime
      },
      mcp: {
        syncSuccess: mcpSuccesses,
        syncFailures: mcpFailures,
        lastSyncTime: lastMCPSync
      }
    };

    this.lastSnapshot = snapshot;
    this.checkThresholds(snapshot);

    return snapshot;
  }

  /**
   * Get percentile value from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Calculate CPU percentage
   */
  private calculateCPUPercentage(cpuUsage: NodeJS.CpuUsage): number {
    // Simplified CPU calculation - in production would track deltas
    const totalMicros = cpuUsage.user + cpuUsage.system;
    const totalSeconds = totalMicros / 1000000;
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    return Math.min(100, (totalSeconds / uptimeSeconds) * 100);
  }

  /**
   * Check metrics against thresholds
   */
  private checkThresholds(snapshot: MetricSnapshot): void {
    // Check latency
    if (snapshot.latency.p95 > this.LATENCY_P95_THRESHOLD) {
      this.emitAlert({
        severity: 'warning',
        metric: 'latency_p95',
        message: 'P95 latency exceeds threshold',
        value: snapshot.latency.p95,
        threshold: this.LATENCY_P95_THRESHOLD,
        timestamp: snapshot.timestamp
      });
    }

    // Check error rate
    if (snapshot.errorRate.percentage > this.ERROR_RATE_THRESHOLD) {
      this.emitAlert({
        severity: 'critical',
        metric: 'error_rate',
        message: `Error rate ${(snapshot.errorRate.percentage * 100).toFixed(1)}% exceeds ${this.ERROR_RATE_THRESHOLD * 100}% threshold`,
        value: snapshot.errorRate.percentage,
        threshold: this.ERROR_RATE_THRESHOLD,
        timestamp: snapshot.timestamp
      });
    }

    // Check queue depth
    if (snapshot.queue.depth > this.QUEUE_DEPTH_THRESHOLD) {
      this.emitAlert({
        severity: 'warning',
        metric: 'queue_depth',
        message: 'Queue depth exceeds threshold',
        value: snapshot.queue.depth,
        threshold: this.QUEUE_DEPTH_THRESHOLD,
        timestamp: snapshot.timestamp
      });
    }

    // Check memory
    if (snapshot.resources.memoryUsageMB > this.MEMORY_THRESHOLD_MB) {
      this.emitAlert({
        severity: 'warning',
        metric: 'memory_usage',
        message: 'Memory usage exceeds threshold',
        value: snapshot.resources.memoryUsageMB,
        threshold: this.MEMORY_THRESHOLD_MB,
        timestamp: snapshot.timestamp
      });
    }
  }

  /**
   * Check error rate and emit alerts
   */
  private checkErrorRate(): void {
    const recentTasks = this.taskCompletions.filter(
      t => Date.now() - t.timestamp < 3600000 // Last hour
    );

    if (recentTasks.length >= 10) {
      const failures = recentTasks.filter(t => !t.success).length;
      const errorRate = failures / recentTasks.length;

      if (errorRate > this.ERROR_RATE_THRESHOLD) {
        this.emitAlert({
          severity: 'critical',
          metric: 'error_rate_hourly',
          message: `Hourly error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`,
          value: errorRate,
          threshold: this.ERROR_RATE_THRESHOLD,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Emit performance alert
   */
  private emitAlert(alert: PerformanceAlert): void {
    logWarning('Performance alert', {
      severity: alert.severity,
      metric: alert.metric,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold
    });

    this.emit('alert', alert);
  }

  /**
   * Get current metrics summary
   */
  getSummary(): string {
    const snapshot = this.lastSnapshot;
    if (!snapshot) {
      return 'No metrics available yet';
    }

    return `
📊 Metrics Summary (${new Date(snapshot.timestamp).toISOString()})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Throughput: ${snapshot.throughput.tasksPerHour} tasks/hour
Latency: p50=${Math.round(snapshot.latency.p50)}ms, p95=${Math.round(snapshot.latency.p95)}ms
Error Rate: ${(snapshot.errorRate.percentage * 100).toFixed(1)}%
Queue: ${snapshot.queue.depth} tasks (${snapshot.queue.blockedTasks} blocked)
Memory: ${snapshot.resources.memoryUsageMB}MB
CPU: ${snapshot.resources.cpuPercentage.toFixed(1)}%
Uptime: ${Math.round(snapshot.resources.uptime / 1000 / 60)} minutes
MCP Sync: ${snapshot.mcp.syncSuccess}/${snapshot.mcp.syncSuccess + snapshot.mcp.syncFailures} successful
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const snapshot = this.lastSnapshot;
    if (!snapshot) {
      return '';
    }

    const lines = [
      '# HELP orchestrator_throughput_tasks_per_hour Tasks completed per hour',
      '# TYPE orchestrator_throughput_tasks_per_hour gauge',
      `orchestrator_throughput_tasks_per_hour ${snapshot.throughput.tasksPerHour}`,
      '',
      '# HELP orchestrator_latency_milliseconds Task latency in milliseconds',
      '# TYPE orchestrator_latency_milliseconds summary',
      `orchestrator_latency_milliseconds{quantile="0.5"} ${snapshot.latency.p50}`,
      `orchestrator_latency_milliseconds{quantile="0.95"} ${snapshot.latency.p95}`,
      `orchestrator_latency_milliseconds{quantile="0.99"} ${snapshot.latency.p99}`,
      '',
      '# HELP orchestrator_error_rate Task error rate',
      '# TYPE orchestrator_error_rate gauge',
      `orchestrator_error_rate ${snapshot.errorRate.percentage}`,
      '',
      '# HELP orchestrator_queue_depth Number of tasks in queue',
      '# TYPE orchestrator_queue_depth gauge',
      `orchestrator_queue_depth ${snapshot.queue.depth}`,
      '',
      '# HELP orchestrator_memory_usage_mb Memory usage in MB',
      '# TYPE orchestrator_memory_usage_mb gauge',
      `orchestrator_memory_usage_mb ${snapshot.resources.memoryUsageMB}`,
    ];

    return lines.join('\n');
  }

  /**
   * Periodic cleanup of old data
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.RETENTION_PERIOD;

      // Clean old completions
      this.taskCompletions = this.taskCompletions.filter(
        t => t.timestamp > cutoff
      );

      // Clean old MCP sync attempts
      this.mcpSyncAttempts = this.mcpSyncAttempts.filter(
        a => a.timestamp > cutoff
      );

      logInfo('Metrics cleanup completed', {
        completions: this.taskCompletions.length,
        mcpAttempts: this.mcpSyncAttempts.length
      });
    }, 3600000); // Every hour
  }

  /**
   * Get last snapshot
   */
  getLastSnapshot(): MetricSnapshot | undefined {
    return this.lastSnapshot;
  }
}