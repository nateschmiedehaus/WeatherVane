import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logWarning } from '../telemetry/logger.js';

import type {
  AutopilotHealthReport,
  OrchestrationMetrics,
  ResolutionMetricsData,
  UsageLog,
  ResourceMetricsSnapshot,
  ProviderCapacityMetrics,
  MetricsSummary,
} from './types.js';

const AUTOPILOT_HEALTH_RELATIVE = 'state/analytics/autopilot_health_report.json';
const ORCHESTRATION_METRICS_RELATIVE = 'state/analytics/orchestration_metrics.json';
const USAGE_LOG_RELATIVE = 'state/limits/usage_log.json';
const QUALITY_DECISIONS_RELATIVE = 'state/analytics/quality_gate_decisions.jsonl';
const RESOURCE_METRICS_RELATIVE = 'state/analytics/resource_metrics.json';
const PROVIDER_CAPACITY_RELATIVE = 'state/analytics/provider_capacity_metrics.json';
const RESOLUTION_METRICS_RELATIVE = 'state/analytics/resolution_metrics.json';
const METRICS_SUMMARY_RELATIVE = 'state/telemetry/metrics_summary.json';
const ROADMAP_RELATIVE = 'state/roadmap.yaml';

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    logWarning('Failed to read observability input file', { filePath, error: message });
    return undefined;
  }
}

async function readJsonLines<T>(filePath: string, limit = 200): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!lines.length) {
      return [];
    }
    const slice = lines.slice(-limit);
    return slice.map((line) => JSON.parse(line) as T);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    const message = error instanceof Error ? error.message : String(error);
    logWarning('Failed to read JSONL observability input file', { filePath, error: message });
    return [];
  }
}

async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    logWarning('Failed to read observability text file', { filePath, error: message });
    return undefined;
  }
}

export class ObservabilityMetricsLoader {
  constructor(private readonly workspaceRoot: string) {}

  private resolve(relative: string): string {
    return path.resolve(this.workspaceRoot, relative);
  }

  async loadAutopilotHealth(): Promise<AutopilotHealthReport | undefined> {
    return readJsonFile<AutopilotHealthReport>(this.resolve(AUTOPILOT_HEALTH_RELATIVE));
  }

  async loadOrchestrationMetrics(): Promise<OrchestrationMetrics | undefined> {
    return readJsonFile<OrchestrationMetrics>(this.resolve(ORCHESTRATION_METRICS_RELATIVE));
  }

  async loadUsageLog(): Promise<UsageLog | undefined> {
    return readJsonFile<UsageLog>(this.resolve(USAGE_LOG_RELATIVE));
  }

  async loadQualityGateDecisions(limit = 200): Promise<Record<string, unknown>[]> {
    return readJsonLines<Record<string, unknown>>(this.resolve(QUALITY_DECISIONS_RELATIVE), limit);
  }

  async loadResourceMetrics(): Promise<ResourceMetricsSnapshot | undefined> {
    return readJsonFile<ResourceMetricsSnapshot>(this.resolve(RESOURCE_METRICS_RELATIVE));
  }

  async loadProviderCapacity(): Promise<ProviderCapacityMetrics | undefined> {
    return readJsonFile<ProviderCapacityMetrics>(this.resolve(PROVIDER_CAPACITY_RELATIVE));
  }

  async loadResolutionMetrics(): Promise<ResolutionMetricsData | undefined> {
    return readJsonFile<ResolutionMetricsData>(this.resolve(RESOLUTION_METRICS_RELATIVE));
  }

  async loadMetricsSummary(): Promise<MetricsSummary | undefined> {
    return readJsonFile<MetricsSummary>(this.resolve(METRICS_SUMMARY_RELATIVE));
  }

  async loadRoadmapYaml(): Promise<string | undefined> {
    return readTextFile(this.resolve(ROADMAP_RELATIVE));
  }
}
