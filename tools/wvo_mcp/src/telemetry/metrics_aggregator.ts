/**
 * Metrics Aggregator for Dashboard Generation
 *
 * Reads metrics.jsonl and produces segmented dashboard with:
 * - Overall summary (success rate, avg cost, avg time)
 * - Segmented metrics (by task type, complexity, agent, etc.)
 * - 7-day trends
 * - Automated recommendations
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logDebug, logWarning } from './logger.js';
import type { MetricsRecord, MetricsTags } from './metrics_collector.js';

/**
 * Dashboard metadata (data quality assessment)
 */
export interface DashboardMetadata {
  dataQuality: 'insufficient' | 'emerging' | 'stable' | 'mature';
  sampleSize: number;
  daysCovered: number;
  warnings: string[];
}

/**
 * Segmented metrics for a specific dimension value
 */
export interface SegmentMetrics {
  count: number;
  successRate: number;
  avgCostUsd: number;
  avgTimeMin: number;
  avgIterations: number;
  p50TimeMin: number;
  p95TimeMin: number;
  p99TimeMin: number;
}

/**
 * Feature effectiveness comparison (with vs without feature)
 */
export interface FeatureEffectiveness {
  feature: string;
  used: SegmentMetrics;
  notUsed: SegmentMetrics;
  roi: string;
}

/**
 * Complete dashboard
 */
export interface MetricsDashboard {
  period: string;
  metadata: DashboardMetadata;
  summary: {
    tasksCompleted: number;
    tasksFailed: number;
    successRate: number;
    avgTimeToCompletionMin: number;
    avgCostPerTaskUsd: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  byTaskType: Record<string, SegmentMetrics>;
  byComplexityTier: Record<string, SegmentMetrics>;
  byAgentType: Record<string, SegmentMetrics>;
  byEpic: Record<string, SegmentMetrics>;
  byMilestone: Record<string, SegmentMetrics>;
  featureEffectiveness: {
    thinkStage: FeatureEffectiveness;
    complexityRouter: {
      accuracy: number;
      overprovisioned: number;
      underprovisioned: number;
    };
  };
  trends: {
    successRate7d: number[];
    avgCost7d: number[];
    avgTime7d: number[];
  };
  recommendations: string[];
}

/**
 * Calculate percentiles (p50, p95, p99) for an array of numbers
 */
function calculatePercentiles(values: number[]): { p50: number; p95: number; p99: number } {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);

  return {
    p50: sorted[p50Index],
    p95: sorted[p95Index],
    p99: sorted[p99Index],
  };
}

/**
 * Compute segment metrics from filtered records
 */
function computeSegmentMetrics(records: MetricsRecord[]): SegmentMetrics {
  if (records.length === 0) {
    return {
      count: 0,
      successRate: 0,
      avgCostUsd: 0,
      avgTimeMin: 0,
      avgIterations: 0,
      p50TimeMin: 0,
      p95TimeMin: 0,
      p99TimeMin: 0,
    };
  }

  const successCount = records.filter((r) => r.quality.taskSucceeded).length;
  const totalCost = records.reduce((sum, r) => sum + r.efficiency.costUsd, 0);
  const totalTime = records.reduce((sum, r) => sum + r.efficiency.durationMs, 0);
  const totalIterations = records.reduce((sum, r) => sum + r.quality.iterationCount, 0);
  const times = records.map((r) => r.efficiency.durationMs / 60000); // Convert to minutes

  const percentiles = calculatePercentiles(times);

  return {
    count: records.length,
    successRate: successCount / records.length,
    avgCostUsd: totalCost / records.length,
    avgTimeMin: totalTime / records.length / 60000,
    avgIterations: totalIterations / records.length,
    p50TimeMin: percentiles.p50,
    p95TimeMin: percentiles.p95,
    p99TimeMin: percentiles.p99,
  };
}

/**
 * Metrics Aggregator
 */
export class MetricsAggregator {
  private metricsPath: string;

  constructor(private workspaceRoot: string) {
    this.metricsPath = path.join(workspaceRoot, 'state', 'telemetry', 'metrics.jsonl');
  }

  /**
   * Read all metrics records
   */
  private async readRecords(): Promise<MetricsRecord[]> {
    try {
      const content = await fs.readFile(this.metricsPath, 'utf-8');
      const lines = content.trim().split('\n').filter((line) => line.length > 0);

      const records: MetricsRecord[] = [];
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch (error) {
          logWarning('Failed to parse metrics record', {
            line: line.slice(0, 100),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return records;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // No metrics yet
      }
      throw error;
    }
  }

  /**
   * Filter records by date range
   */
  private filterByDateRange(
    records: MetricsRecord[],
    startDate: Date,
    endDate: Date
  ): MetricsRecord[] {
    return records.filter((record) => {
      const timestamp = new Date(record.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    });
  }

  /**
   * Compute dashboard metadata
   */
  private computeMetadata(records: MetricsRecord[], startDate: Date, endDate: Date): DashboardMetadata {
    const warnings: string[] = [];

    if (records.length === 0) {
      warnings.push('No metrics data available');
      return {
        dataQuality: 'insufficient',
        sampleSize: 0,
        daysCovered: 0,
        warnings,
      };
    }

    const daysCovered = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    let dataQuality: DashboardMetadata['dataQuality'];
    if (daysCovered < 3) {
      dataQuality = 'insufficient';
      warnings.push('Less than 3 days of data - trends may not be meaningful');
    } else if (daysCovered < 7) {
      dataQuality = 'emerging';
      warnings.push('Less than 7 days of data - trends are tentative');
    } else if (daysCovered < 30) {
      dataQuality = 'stable';
    } else {
      dataQuality = 'mature';
    }

    if (records.length < 10) {
      warnings.push('Small sample size (< 10 tasks) - percentiles may be unstable');
    }

    return {
      dataQuality,
      sampleSize: records.length,
      daysCovered,
      warnings,
    };
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(dashboard: MetricsDashboard): string[] {
    const recommendations: string[] = [];

    // Quality: Low success rate
    if (dashboard.summary.successRate < 0.85) {
      const successPercent = (dashboard.summary.successRate * 100).toFixed(0);
      recommendations.push(
        `HIGH PRIORITY: Overall success rate is ${successPercent}% (target 90%). Investigate top failure causes.`
      );
    }

    // Efficiency: High avg cost
    if (dashboard.summary.avgCostPerTaskUsd > 1.0) {
      recommendations.push(
        `MEDIUM PRIORITY: Average cost per task is $${dashboard.summary.avgCostPerTaskUsd.toFixed(2)} (target < $1.00). Review model tier selection.`
      );
    }

    // Complexity accuracy
    const complexityAccuracy = dashboard.featureEffectiveness.complexityRouter.accuracy;
    if (complexityAccuracy < 0.75) {
      recommendations.push(
        `MEDIUM PRIORITY: ComplexityRouter accuracy is ${(complexityAccuracy * 100).toFixed(0)}% (target 85%). Tune complexity scoring.`
      );
    }

    // THINK stage ROI
    const thinkROI = dashboard.featureEffectiveness.thinkStage;
    if (thinkROI.used.count > 0 && thinkROI.notUsed.count > 0) {
      const costSavings = ((thinkROI.notUsed.avgCostUsd - thinkROI.used.avgCostUsd) / thinkROI.notUsed.avgCostUsd) * 100;
      if (costSavings > 15) {
        recommendations.push(
          `OPTIMIZATION: THINK stage shows ${costSavings.toFixed(0)}% cost savings. Consider using for medium complexity tasks.`
        );
      }
    }

    // Task type performance gaps
    const taskTypes = Object.entries(dashboard.byTaskType);
    if (taskTypes.length > 1) {
      const sorted = taskTypes.sort((a, b) => a[1].successRate - b[1].successRate);
      const lowest = sorted[0];
      const highest = sorted[sorted.length - 1];
      const gap = (highest[1].successRate - lowest[1].successRate) * 100;

      if (gap > 15 && lowest[1].count >= 5) {
        recommendations.push(
          `LOW PRIORITY: "${lowest[0]}" tasks have ${gap.toFixed(0)}% lower success rate than "${highest[0]}" tasks. Investigate patterns.`
        );
      }
    }

    // Data quality warnings
    if (dashboard.metadata.dataQuality === 'insufficient') {
      recommendations.push('INFO: Insufficient data for meaningful recommendations. Continue collecting metrics.');
    }

    return recommendations;
  }

  /**
   * Compute 7-day trends
   */
  private compute7DayTrends(allRecords: MetricsRecord[]): {
    successRate7d: number[];
    avgCost7d: number[];
    avgTime7d: number[];
  } {
    const trends: { successRate7d: number[]; avgCost7d: number[]; avgTime7d: number[] } = {
      successRate7d: [],
      avgCost7d: [],
      avgTime7d: [],
    };

    if (allRecords.length === 0) {
      return trends;
    }

    // Get last 7 days
    const now = new Date();
    const days: MetricsRecord[][] = Array.from({ length: 7 }, () => []);

    for (const record of allRecords) {
      const timestamp = new Date(record.timestamp);
      const daysDiff = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff >= 0 && daysDiff < 7) {
        days[6 - daysDiff].push(record);
      }
    }

    // Compute daily metrics
    for (const dayRecords of days) {
      if (dayRecords.length === 0) {
        trends.successRate7d.push(0);
        trends.avgCost7d.push(0);
        trends.avgTime7d.push(0);
      } else {
        const successCount = dayRecords.filter((r) => r.quality.taskSucceeded).length;
        const totalCost = dayRecords.reduce((sum, r) => sum + r.efficiency.costUsd, 0);
        const totalTime = dayRecords.reduce((sum, r) => sum + r.efficiency.durationMs, 0);

        trends.successRate7d.push(successCount / dayRecords.length);
        trends.avgCost7d.push(totalCost / dayRecords.length);
        trends.avgTime7d.push(totalTime / dayRecords.length / 60000);
      }
    }

    return trends;
  }

  /**
   * Compute dashboard for given date range
   */
  async computeDashboard(startDate?: Date, endDate?: Date): Promise<MetricsDashboard> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default: last 24h
    const end = endDate || now;

    logDebug('Computing metrics dashboard', {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    const allRecords = await this.readRecords();
    const records = this.filterByDateRange(allRecords, start, end);

    const metadata = this.computeMetadata(records, start, end);

    // Overall summary
    const successCount = records.filter((r) => r.quality.taskSucceeded).length;
    const failCount = records.length - successCount;
    const totalTokens = records.reduce((sum, r) => sum + r.efficiency.totalTokens, 0);
    const totalCost = records.reduce((sum, r) => sum + r.efficiency.costUsd, 0);
    const totalTime = records.reduce((sum, r) => sum + r.efficiency.durationMs, 0);

    const summary = {
      tasksCompleted: successCount,
      tasksFailed: failCount,
      successRate: records.length > 0 ? successCount / records.length : 0,
      avgTimeToCompletionMin: records.length > 0 ? totalTime / records.length / 60000 : 0,
      avgCostPerTaskUsd: records.length > 0 ? totalCost / records.length : 0,
      totalTokens,
      totalCostUsd: totalCost,
    };

    // Segment by task type
    const byTaskType: Record<string, SegmentMetrics> = {};
    const taskTypes = new Set(records.map((r) => r.tags.taskType));
    for (const taskType of taskTypes) {
      const filtered = records.filter((r) => r.tags.taskType === taskType);
      byTaskType[taskType] = computeSegmentMetrics(filtered);
    }

    // Segment by complexity tier
    const byComplexityTier: Record<string, SegmentMetrics> = {};
    const complexityTiers = new Set(records.map((r) => r.tags.complexityTier));
    for (const tier of complexityTiers) {
      const filtered = records.filter((r) => r.tags.complexityTier === tier);
      byComplexityTier[tier] = computeSegmentMetrics(filtered);
    }

    // Segment by agent type
    const byAgentType: Record<string, SegmentMetrics> = {};
    const agentTypes = new Set(records.map((r) => r.tags.agentType).filter((a) => a !== undefined) as string[]);
    for (const agentType of agentTypes) {
      const filtered = records.filter((r) => r.tags.agentType === agentType);
      byAgentType[agentType] = computeSegmentMetrics(filtered);
    }

    // Segment by epic
    const byEpic: Record<string, SegmentMetrics> = {};
    const epics = new Set(records.map((r) => r.tags.epic).filter((e) => e !== undefined) as string[]);
    for (const epic of epics) {
      const filtered = records.filter((r) => r.tags.epic === epic);
      byEpic[epic] = computeSegmentMetrics(filtered);
    }

    // Segment by milestone
    const byMilestone: Record<string, SegmentMetrics> = {};
    const milestones = new Set(records.map((r) => r.tags.milestone).filter((m) => m !== undefined) as string[]);
    for (const milestone of milestones) {
      const filtered = records.filter((r) => r.tags.milestone === milestone);
      byMilestone[milestone] = computeSegmentMetrics(filtered);
    }

    // Feature effectiveness: THINK stage
    const withThink = records.filter((r) => r.tags.usedThinkStage);
    const withoutThink = records.filter((r) => !r.tags.usedThinkStage);
    const thinkMetrics = computeSegmentMetrics(withThink);
    const noThinkMetrics = computeSegmentMetrics(withoutThink);

    let thinkROI = 'Insufficient data';
    if (withThink.length >= 5 && withoutThink.length >= 5) {
      const costSavings = ((noThinkMetrics.avgCostUsd - thinkMetrics.avgCostUsd) / noThinkMetrics.avgCostUsd) * 100;
      thinkROI = costSavings > 0
        ? `+${costSavings.toFixed(0)}% cost savings when used`
        : `${Math.abs(costSavings).toFixed(0)}% cost increase when used`;
    }

    // ComplexityRouter accuracy (simplified - count over/under provisioning)
    const routerRecords = records.filter((r) => r.tags.usedComplexityRouter);
    let overprovisioned = 0;
    let underprovisioned = 0;
    let optimal = 0;

    for (const record of routerRecords) {
      const { complexityTier } = record.tags;
      const { iterationCount } = record.quality;

      // Expected iterations by tier
      const expectedIterations: Record<string, number> = {
        low: 1,
        medium: 2,
        high: 3,
        critical: 4,
      };

      const expected = expectedIterations[complexityTier] || 2;

      if (iterationCount < expected - 1) {
        overprovisioned++;
      } else if (iterationCount > expected + 1) {
        underprovisioned++;
      } else {
        optimal++;
      }
    }

    const routerAccuracy = routerRecords.length > 0 ? optimal / routerRecords.length : 0;

    // Trends
    const trends = this.compute7DayTrends(allRecords);

    // Construct dashboard
    const dashboard: MetricsDashboard = {
      period: `${start.toISOString()} to ${end.toISOString()}`,
      metadata,
      summary,
      byTaskType,
      byComplexityTier,
      byAgentType,
      byEpic,
      byMilestone,
      featureEffectiveness: {
        thinkStage: {
          feature: 'think_stage',
          used: thinkMetrics,
          notUsed: noThinkMetrics,
          roi: thinkROI,
        },
        complexityRouter: {
          accuracy: routerAccuracy,
          overprovisioned,
          underprovisioned,
        },
      },
      trends,
      recommendations: [],
    };

    // Generate recommendations
    dashboard.recommendations = this.generateRecommendations(dashboard);

    return dashboard;
  }

  /**
   * Write dashboard to disk
   */
  async writeDashboard(dashboard: MetricsDashboard): Promise<void> {
    const dashboardPath = path.join(this.workspaceRoot, 'state', 'analytics', 'metrics_dashboard.json');

    try {
      await fs.mkdir(path.dirname(dashboardPath), { recursive: true });
      await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2));

      logDebug('Metrics dashboard written', { path: dashboardPath });
    } catch (error) {
      logWarning('Failed to write metrics dashboard', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
