/**
 * Model Router Telemetry - Track cost savings from intelligent model selection
 *
 * Compares actual costs (using model router) vs baseline (always Sonnet 3.5)
 * to demonstrate ROI of the model routing system.
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';

import type { ModelTier } from '../orchestrator/model_router.js';
import type { Task } from '../orchestrator/state_machine.js';

import { logDebug, logInfo } from './logger.js';

interface ModelRouterTelemetry {
  version: string;
  startedAt: string | null;
  lastUpdatedAt: string | null;
  totalTasks: number;
  totalCostActual: number;
  totalCostBaseline: number;
  totalSavings: number;
  savingsPercent: number;
  tierDistribution: {
    haiku: number;
    'sonnet-3.5': number;
    'sonnet-4.5': number;
    'sonnet-4.5-reasoning': number;
  };
  recentTasks: Array<{
    taskId: string;
    timestamp: string;
    tier: string;
    complexity: number;
    costActual: number;
    costBaseline: number;
    savings: number;
  }>;
}

export class ModelRouterTelemetryTracker {
  private telemetryPath: string;
  private data: ModelRouterTelemetry | null = null;

  constructor(workspaceRoot: string) {
    this.telemetryPath = path.join(workspaceRoot, 'state', 'analytics', 'model_router_telemetry.json');
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.telemetryPath, 'utf-8');
      this.data = JSON.parse(content);
    } catch (error) {
      // Initialize if file doesn't exist
      this.data = {
        version: '1.0',
        startedAt: null,
        lastUpdatedAt: null,
        totalTasks: 0,
        totalCostActual: 0,
        totalCostBaseline: 0,
        totalSavings: 0,
        savingsPercent: 0,
        tierDistribution: {
          haiku: 0,
          'sonnet-3.5': 0,
          'sonnet-4.5': 0,
          'sonnet-4.5-reasoning': 0,
        },
        recentTasks: [],
      };
    }
  }

  async recordTaskExecution(
    task: Task,
    tier: ModelTier,
    complexity: number,
    estimatedCost: number,
    estimatedTokens: number
  ): Promise<void> {
    if (!this.data) {
      await this.load();
    }

    if (!this.data) {
      throw new Error('Failed to load telemetry data');
    }

    // Baseline: assume we always use Sonnet 3.5 @ $0.015/1K tokens, 5K tokens average
    const baselineCost = (5000 / 1000) * 0.015; // $0.075

    const now = new Date().toISOString();

    if (!this.data.startedAt) {
      this.data.startedAt = now;
    }
    this.data.lastUpdatedAt = now;

    // Update totals
    this.data.totalTasks++;
    this.data.totalCostActual += estimatedCost;
    this.data.totalCostBaseline += baselineCost;
    this.data.totalSavings = this.data.totalCostBaseline - this.data.totalCostActual;
    this.data.savingsPercent = (this.data.totalSavings / this.data.totalCostBaseline) * 100;

    // Update tier distribution
    const tierKey = tier.name as keyof ModelRouterTelemetry['tierDistribution'];
    if (tierKey in this.data.tierDistribution) {
      this.data.tierDistribution[tierKey]++;
    }

    // Add to recent tasks (keep last 100)
    this.data.recentTasks.unshift({
      taskId: task.id,
      timestamp: now,
      tier: tier.name,
      complexity,
      costActual: estimatedCost,
      costBaseline: baselineCost,
      savings: baselineCost - estimatedCost,
    });

    if (this.data.recentTasks.length > 100) {
      this.data.recentTasks = this.data.recentTasks.slice(0, 100);
    }

    await this.save();

    logDebug('Model router telemetry updated', {
      taskId: task.id,
      tier: tier.name,
      complexity,
      costActual: estimatedCost,
      savings: baselineCost - estimatedCost,
      totalSavings: this.data.totalSavings,
      savingsPercent: this.data.savingsPercent,
    });
  }

  private async save(): Promise<void> {
    if (!this.data) return;

    try {
      await fs.writeFile(this.telemetryPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      logInfo('Failed to save model router telemetry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getSummary(): ModelRouterTelemetry | null {
    return this.data;
  }

  async generateReport(): Promise<string> {
    if (!this.data) {
      await this.load();
    }

    if (!this.data || this.data.totalTasks === 0) {
      return 'No model router telemetry data available yet.';
    }

    const lines: string[] = [
      '# Model Router Cost Savings Report',
      '',
      `**Total Tasks:** ${this.data.totalTasks}`,
      `**Total Cost (Actual):** $${this.data.totalCostActual.toFixed(3)}`,
      `**Total Cost (Baseline):** $${this.data.totalCostBaseline.toFixed(3)}`,
      `**Total Savings:** $${this.data.totalSavings.toFixed(3)}`,
      `**Savings Percent:** ${this.data.savingsPercent.toFixed(1)}%`,
      '',
      '## Tier Distribution',
      '',
      `- Haiku (0-3): ${this.data.tierDistribution.haiku} tasks`,
      `- Sonnet 3.5 (4-6): ${this.data.tierDistribution['sonnet-3.5']} tasks`,
      `- Sonnet 4.5 (7-9): ${this.data.tierDistribution['sonnet-4.5']} tasks`,
      `- Sonnet 4.5 + Reasoning (10): ${this.data.tierDistribution['sonnet-4.5-reasoning']} tasks`,
      '',
      '## Recent Tasks',
      '',
    ];

    for (const task of this.data.recentTasks.slice(0, 10)) {
      lines.push(`- ${task.taskId} (${task.tier}): $${task.costActual.toFixed(4)} (saved $${task.savings.toFixed(4)})`);
    }

    return lines.join('\n');
  }
}
