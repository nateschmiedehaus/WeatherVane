/**
 * Health Monitor - Continuous system health checks with auto-remediation
 *
 * Runs periodic health checks and triggers automatic fixes when issues detected.
 * Empowers orchestrator to maintain system stability autonomously.
 */

import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

import { ErrorDetector, type ErrorSignal } from './error_detector.js';

const execAsync = promisify(exec);

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    build: { passed: boolean; errors?: ErrorSignal[] };
    tests: { passed: boolean; errors?: ErrorSignal[]; failureCount?: number };
    audit: { passed: boolean; errors?: ErrorSignal[]; vulnerabilityCount?: number };
    runtime: { passed: boolean; errors?: ErrorSignal[] };
  };
  remediationAttempted: boolean;
  remediationSucceeded: boolean;
  timestamp: string;
}

export interface HealthMonitorConfig {
  checkIntervalMs: number;
  autoRemediate: boolean;
  maxRemediationAttempts: number;
  escalateAfterFailures: number;
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: 5 * 60 * 1000, // 5 minutes
  autoRemediate: true,
  maxRemediationAttempts: 3,
  escalateAfterFailures: 2,
};

/**
 * Proactive health monitoring with auto-remediation
 */
export class HealthMonitor {
  private detector: ErrorDetector;
  private config: HealthMonitorConfig;
  private consecutiveFailures = 0;
  private timer: NodeJS.Timeout | null = null;
  private lastCheckResult: HealthCheckResult | null = null;

  constructor(
    private readonly workspaceRoot: string,
    config: Partial<HealthMonitorConfig> = {}
  ) {
    this.detector = new ErrorDetector(workspaceRoot);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start continuous health monitoring
   */
  start(): void {
    if (this.timer) {
      logWarning('Health monitor already running');
      return;
    }

    logInfo('Starting health monitor', {
      intervalMs: this.config.checkIntervalMs,
      autoRemediate: this.config.autoRemediate,
    });

    // Run initial check immediately
    void this.runHealthCheck();

    // Schedule periodic checks
    this.timer = setInterval(() => {
      void this.runHealthCheck();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logInfo('Health monitor stopped');
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    logInfo('Running health check');

    const result: HealthCheckResult = {
      healthy: true,
      checks: {
        build: { passed: true },
        tests: { passed: true },
        audit: { passed: true },
        runtime: { passed: true },
      },
      remediationAttempted: false,
      remediationSucceeded: false,
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. Build check
      result.checks.build = await this.checkBuild();

      // 2. Test check (only if build passes)
      if (result.checks.build.passed) {
        result.checks.tests = await this.checkTests();
      }

      // 3. Security audit
      result.checks.audit = await this.checkAudit();

      // 4. Runtime health
      result.checks.runtime = await this.checkRuntime();

      // Determine overall health
      result.healthy = Object.values(result.checks).every(c => c.passed);

      // Auto-remediate if unhealthy
      if (!result.healthy && this.config.autoRemediate) {
        result.remediationAttempted = true;
        result.remediationSucceeded = await this.attemptAutoRemediation(result);
      }

      // Track consecutive failures
      if (!result.healthy) {
        this.consecutiveFailures++;

        if (this.consecutiveFailures >= this.config.escalateAfterFailures) {
          await this.escalateToHuman(result);
        }
      } else {
        this.consecutiveFailures = 0;
      }

      this.lastCheckResult = result;
      await this.persistHealthCheck(result);

      return result;
    } catch (error) {
      logError('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get latest health status
   */
  getLastCheckResult(): HealthCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * Get error trends for diagnostics
   */
  getErrorTrends() {
    return this.detector.getErrorTrends();
  }

  // ============ Private Check Methods ============

  private async checkBuild(): Promise<{ passed: boolean; errors?: ErrorSignal[] }> {
    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: this.workspaceRoot,
        timeout: 120000, // 2 minute timeout
      });

      const errors = this.detector.analyzeBuildOutput(stdout, stderr, 0);
      return {
        passed: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      const errors = this.detector.analyzeBuildOutput(
        error.stdout || '',
        error.stderr || '',
        error.code || 1
      );

      return {
        passed: false,
        errors,
      };
    }
  }

  private async checkTests(): Promise<{
    passed: boolean;
    errors?: ErrorSignal[];
    failureCount?: number;
  }> {
    try {
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: this.workspaceRoot,
        timeout: 300000, // 5 minute timeout
      });

      const output = stdout + stderr;
      const errors = this.detector.analyzeTestOutput(output, 0);

      return {
        passed: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        failureCount: errors.length,
      };
    } catch (error: any) {
      const output = (error.stdout || '') + (error.stderr || '');
      const errors = this.detector.analyzeTestOutput(output, error.code || 1);

      return {
        passed: false,
        errors,
        failureCount: errors.length,
      };
    }
  }

  private async checkAudit(): Promise<{
    passed: boolean;
    errors?: ErrorSignal[];
    vulnerabilityCount?: number;
  }> {
    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: this.workspaceRoot,
      });

      const auditData = JSON.parse(stdout);
      const vulnCount = auditData.metadata?.vulnerabilities?.total || 0;

      const errors = this.detector.analyzeAuditOutput(stdout, vulnCount > 0 ? 1 : 0);

      return {
        passed: vulnCount === 0,
        errors: errors.length > 0 ? errors : undefined,
        vulnerabilityCount: vulnCount,
      };
    } catch (error: any) {
      // npm audit exits with non-zero when vulnerabilities found
      const output = error.stdout || '';
      const errors = this.detector.analyzeAuditOutput(output, error.code || 1);

      return {
        passed: false,
        errors,
      };
    }
  }

  private async checkRuntime(): Promise<{ passed: boolean; errors?: ErrorSignal[] }> {
    // Check for:
    // - Recent crash logs
    // - Memory leaks
    // - Stuck processes

    const errors: ErrorSignal[] = [];

    // Check for crash logs in last 5 minutes
    const logPath = path.join(this.workspaceRoot, 'state', 'telemetry');
    try {
      const files = await fs.readdir(logPath);
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      const recentLogPromises = files
        .filter(f => f.endsWith('.log'))
        .map(async f => {
          const stats = await fs.stat(path.join(logPath, f));
          return stats.mtimeMs > fiveMinutesAgo ? f : null;
        });

      const recentLogResults = await Promise.all(recentLogPromises);
      const recentLogs = recentLogResults.filter((f): f is string => f !== null);

      for (const logFile of recentLogs) {
        const content = await fs.readFile(path.join(logPath, logFile), 'utf-8');
        if (content.includes('FATAL') || content.includes('Uncaught')) {
          errors.push({
            type: 'runtime',
            severity: 'critical',
            message: 'Runtime crash detected in logs',
            details: content.slice(-500), // Last 500 chars
            timestamp: new Date().toISOString(),
            source: logFile,
            fixable: false,
          });
        }
      }
    } catch (err) {
      // Log directory doesn't exist or can't be read - not critical
    }

    return {
      passed: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ============ Remediation Methods ============

  private async attemptAutoRemediation(result: HealthCheckResult): Promise<boolean> {
    logInfo('Attempting auto-remediation');

    const allErrors: ErrorSignal[] = [];

    for (const check of Object.values(result.checks)) {
      if (check.errors) {
        allErrors.push(...check.errors);
      }
    }

    // Sort by severity (critical first)
    allErrors.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    let successCount = 0;
    let attemptCount = 0;

    for (const error of allErrors) {
      if (attemptCount >= this.config.maxRemediationAttempts) {
        logWarning('Max remediation attempts reached', {
          attempted: attemptCount,
          succeeded: successCount,
        });
        break;
      }

      attemptCount++;
      const remediationResult = await this.detector.attemptRemediation(error);

      if (remediationResult.success) {
        successCount++;
        logInfo('Remediation succeeded', {
          errorType: error.type,
          fix: remediationResult.fixDescription,
        });
      } else {
        logWarning('Remediation failed', {
          errorType: error.type,
          error: remediationResult.error,
        });
      }
    }

    // Re-run health check to verify fixes worked
    if (successCount > 0) {
      logInfo('Re-running health check to verify fixes');
      const verifyResult = await this.runHealthCheck();
      return verifyResult.healthy;
    }

    return false;
  }

  private async escalateToHuman(result: HealthCheckResult): Promise<void> {
    const escalationMessage = {
      severity: 'critical',
      message: `System health degraded after ${this.consecutiveFailures} consecutive failures`,
      timestamp: new Date().toISOString(),
      healthCheck: result,
      errorTrends: this.detector.getErrorTrends(),
      actionRequired: 'Manual intervention required',
    };

    // Write escalation to state for human review
    const escalationPath = path.join(
      this.workspaceRoot,
      'state',
      'escalations',
      `health-escalation-${Date.now()}.json`
    );

    await fs.mkdir(path.dirname(escalationPath), { recursive: true });
    await fs.writeFile(escalationPath, JSON.stringify(escalationMessage, null, 2));

    logError('Health issue escalated to human', escalationMessage);
  }

  private async persistHealthCheck(result: HealthCheckResult): Promise<void> {
    const healthPath = path.join(
      this.workspaceRoot,
      'state',
      'analytics',
      'health_checks.jsonl'
    );

    await fs.mkdir(path.dirname(healthPath), { recursive: true });
    await fs.appendFile(healthPath, JSON.stringify(result) + '\n');
  }
}
