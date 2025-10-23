/**
 * Verification Telemetry Logger
 *
 * Logs all task verification attempts with full details for debugging and auditing.
 * Supports KPI dashboard integration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface VerificationTelemetryEntry {
  timestamp: string;
  task_id: string;
  task_title: string;
  verification_type: 'pre_check' | 'post_check' | 'critic' | 'artifact_check';
  check_name: string;
  command?: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  duration_ms: number;
  passed: boolean;
  error?: string;
  artifacts_found?: string[];
  metrics_extracted?: Record<string, any>;
}

export interface VerificationSummary {
  total_verifications: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_duration_ms: number;
  recent_failures: VerificationTelemetryEntry[];
}

export class VerificationTelemetryLogger {
  private logFilePath: string;
  private summaryFilePath: string;

  constructor(workspaceRoot: string) {
    this.logFilePath = path.join(workspaceRoot, 'state', 'telemetry', 'task_verification.jsonl');
    this.summaryFilePath = path.join(workspaceRoot, 'state', 'analytics', 'verification_summary.json');
  }

  /**
   * Log a verification attempt
   */
  async log(entry: VerificationTelemetryEntry): Promise<void> {
    try {
      await this.ensureTelemetryDir();

      // Append to JSONL file
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.logFilePath, line, 'utf-8');

      // Update summary statistics
      await this.updateSummary();

    } catch (error) {
      console.error('Failed to log verification telemetry:', error);
    }
  }

  /**
   * Log multiple verification entries at once
   */
  async logBatch(entries: VerificationTelemetryEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.log(entry);
    }
  }

  /**
   * Get summary statistics
   */
  async getSummary(sinceTimestamp?: string): Promise<VerificationSummary> {
    try {
      const entries = await this.readEntries(sinceTimestamp);

      const total = entries.length;
      const passed = entries.filter(e => e.passed).length;
      const failed = total - passed;
      const pass_rate = total > 0 ? (passed / total) : 0;
      const avg_duration = total > 0 ? entries.reduce((sum, e) => sum + e.duration_ms, 0) / total : 0;

      const recent_failures = entries
        .filter(e => !e.passed)
        .slice(-10); // Last 10 failures

      return {
        total_verifications: total,
        passed,
        failed,
        pass_rate,
        avg_duration_ms: avg_duration,
        recent_failures
      };

    } catch (error) {
      return {
        total_verifications: 0,
        passed: 0,
        failed: 0,
        pass_rate: 0,
        avg_duration_ms: 0,
        recent_failures: []
      };
    }
  }

  /**
   * Get verification history for a specific task
   */
  async getTaskHistory(taskId: string): Promise<VerificationTelemetryEntry[]> {
    const entries = await this.readEntries();
    return entries.filter(e => e.task_id === taskId);
  }

  /**
   * Get recent verification failures
   */
  async getRecentFailures(limit: number = 10): Promise<VerificationTelemetryEntry[]> {
    const entries = await this.readEntries();
    return entries
      .filter(e => !e.passed)
      .slice(-limit);
  }

  /**
   * Clear old telemetry entries (keep last N days)
   */
  async cleanup(keepDays: number = 30): Promise<void> {
    try {
      const entries = await this.readEntries();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);
      const cutoffISO = cutoffDate.toISOString();

      const kept = entries.filter(e => e.timestamp >= cutoffISO);

      // Rewrite file with kept entries
      const lines = kept.map(e => JSON.stringify(e) + '\n');
      await fs.writeFile(this.logFilePath, lines.join(''), 'utf-8');

    } catch (error) {
      console.error('Failed to cleanup verification telemetry:', error);
    }
  }

  private async ensureTelemetryDir(): Promise<void> {
    const dir = path.dirname(this.logFilePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory exists, ignore
    }
  }

  private async readEntries(sinceTimestamp?: string): Promise<VerificationTelemetryEntry[]> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.length > 0);
      let entries = lines.map(line => JSON.parse(line) as VerificationTelemetryEntry);

      if (sinceTimestamp) {
        entries = entries.filter(e => e.timestamp >= sinceTimestamp);
      }

      return entries;

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  private async updateSummary(): Promise<void> {
    try {
      const summary = await this.getSummary();

      await fs.mkdir(path.dirname(this.summaryFilePath), { recursive: true });
      await fs.writeFile(this.summaryFilePath, JSON.stringify(summary, null, 2), 'utf-8');

    } catch (error) {
      console.error('Failed to update verification summary:', error);
    }
  }

  /**
   * Generate KPI dashboard data
   */
  async generateKPIDashboard(): Promise<{
    modeling_verification_status: string;
    pass_rate: string;
    recent_failures: number;
    avg_verification_time: string;
  }> {
    const summary = await this.getSummary();

    const status = summary.pass_rate >= 0.95 ? '✅ PASSING' :
                   summary.pass_rate >= 0.80 ? '⚠️ DEGRADED' :
                   '❌ FAILING';

    return {
      modeling_verification_status: status,
      pass_rate: `${(summary.pass_rate * 100).toFixed(1)}%`,
      recent_failures: summary.recent_failures.length,
      avg_verification_time: `${(summary.avg_duration_ms / 1000).toFixed(2)}s`
    };
  }
}

/**
 * Helper function to create telemetry entry
 */
export function createVerificationEntry(
  taskId: string,
  taskTitle: string,
  verificationType: 'pre_check' | 'post_check' | 'critic' | 'artifact_check',
  checkName: string,
  command: string | undefined,
  exitCode: number | undefined,
  stdout: string | undefined,
  stderr: string | undefined,
  durationMs: number,
  passed: boolean,
  error?: string
): VerificationTelemetryEntry {
  return {
    timestamp: new Date().toISOString(),
    task_id: taskId,
    task_title: taskTitle,
    verification_type: verificationType,
    check_name: checkName,
    command,
    exit_code: exitCode,
    stdout,
    stderr,
    duration_ms: durationMs,
    passed,
    error
  };
}
