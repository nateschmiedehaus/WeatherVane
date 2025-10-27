import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logWarning } from '../telemetry/logger.js';

import type { AutopilotHealthReport, OrchestrationMetrics, UsageLog } from './types.js';

const AUTOPILOT_HEALTH_RELATIVE = 'state/analytics/autopilot_health_report.json';
const ORCHESTRATION_METRICS_RELATIVE = 'state/analytics/orchestration_metrics.json';
const USAGE_LOG_RELATIVE = 'state/limits/usage_log.json';

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarning('Failed to read observability input file', { filePath, error: message });
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
}
