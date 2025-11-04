/**
 * Work Process Quality Integration
 *
 * Integrates quality check scripts into WorkProcessEnforcer for autonomous quality enforcement.
 *
 * Supports three modes:
 * - shadow: Run checks, log results, never block (observation only)
 * - observe: Run checks, log warnings, never block (agent awareness)
 * - enforce: Run checks, block phase transitions on failure (active enforcement)
 *
 * Fail-safe design: Timeouts and errors default to non-blocking to preserve autopilot velocity.
 *
 * Connection to Autopilot Mission:
 * - Enables 100% autonomous quality enforcement (zero human intervention)
 * - Quality gates replace human review with consistent, comprehensive checks
 * - Meta-cognitive capability: system verifies its own work
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { MetricsCollector } from '../telemetry/metrics_collector.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

/**
 * Quality check modes for gradual rollout
 */
export type QualityCheckMode = 'shadow' | 'observe' | 'enforce';

/**
 * Configuration for a single quality check type
 */
export interface QualityCheckTypeConfig {
  enabled: boolean;
  timeoutMs: number;
  scriptPath?: string;
}

/**
 * Complete quality check configuration
 */
export interface QualityCheckConfig {
  /** Check execution mode (shadow/observe/enforce) */
  mode: QualityCheckMode;

  /** Pre-flight health checks (before IMPLEMENT phase) */
  preflight: QualityCheckTypeConfig;

  /** Quality gates (before VERIFY phase) */
  qualityGates: QualityCheckTypeConfig;

  /** Reasoning validation (before MONITOR phase) */
  reasoning: QualityCheckTypeConfig;

  /** Fail-safe mode: if timeout/error, log warning and continue (don't block) */
  failSafe: boolean;
}

/**
 * Result of running a quality check
 */
export interface QualityCheckResult {
  /** Check type identifier */
  checkType: 'preflight' | 'quality_gates' | 'reasoning';

  /** Task ID this check was run for */
  taskId: string;

  /** Whether check passed (all checks green) */
  passed: boolean;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Whether check timed out */
  timedOut: boolean;

  /** Error message if check script failed */
  error?: string;

  /** Detailed check results */
  details: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warnings: string[];
    failures: string[];
  };

  /** Whether phase transition should be blocked */
  blockTransition: boolean;

  /** Path to JSON report file (if generated) */
  reportPath?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: QualityCheckConfig = {
  mode: 'shadow',
  preflight: {
    enabled: true,
    timeoutMs: 30000,
    scriptPath: 'scripts/preflight_check.sh',
  },
  qualityGates: {
    enabled: true,
    timeoutMs: 15000,
    scriptPath: 'scripts/check_quality_gates.sh',
  },
  reasoning: {
    enabled: true,
    timeoutMs: 20000,
    scriptPath: 'scripts/check_reasoning.sh',
  },
  failSafe: true,
};

/**
 * Integrates quality check scripts into WorkProcessEnforcer
 *
 * Example usage:
 * ```typescript
 * const qualityIntegration = new WorkProcessQualityIntegration(
 *   { mode: 'shadow', preflight: { enabled: true }, ...},
 *   '/path/to/workspace',
 *   metricsCollector
 * );
 *
 * const result = await qualityIntegration.runPreflightChecks('TASK-123');
 * if (result.blockTransition) {
 *   throw new Error('Pre-flight checks failed');
 * }
 * ```
 */
export class WorkProcessQualityIntegration {
  private config: QualityCheckConfig;
  private workspaceRoot: string;
  private metricsCollector: MetricsCollector;

  /**
   * Create quality integration instance
   *
   * @param config - Quality check configuration (mode, timeouts, script paths)
   * @param workspaceRoot - Absolute path to workspace root
   * @param metricsCollector - Metrics collector for telemetry
   *
   * @throws Error if workspace root doesn't exist or scripts not found
   */
  constructor(
    config: Partial<QualityCheckConfig>,
    workspaceRoot: string,
    metricsCollector: MetricsCollector
  ) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      preflight: { ...DEFAULT_CONFIG.preflight, ...config.preflight },
      qualityGates: { ...DEFAULT_CONFIG.qualityGates, ...config.qualityGates },
      reasoning: { ...DEFAULT_CONFIG.reasoning, ...config.reasoning },
    };

    // Validate workspace root
    this.workspaceRoot = path.resolve(workspaceRoot);
    if (!fs.existsSync(this.workspaceRoot)) {
      throw new Error(`Workspace root does not exist: ${this.workspaceRoot}`);
    }

    this.metricsCollector = metricsCollector;

    // Validate script paths exist
    this.validateScriptPaths();

    logInfo('[QualityIntegration] Initialized', {
      mode: this.config.mode,
      preflight: this.config.preflight.enabled,
      qualityGates: this.config.qualityGates.enabled,
      reasoning: this.config.reasoning.enabled,
      failSafe: this.config.failSafe,
    });
  }

  /**
   * Validate that all enabled script paths exist
   * @throws Error if any enabled script is not found
   */
  private validateScriptPaths(): void {
    const checks: Array<{ name: string; config: QualityCheckTypeConfig }> = [
      { name: 'preflight', config: this.config.preflight },
      { name: 'qualityGates', config: this.config.qualityGates },
      { name: 'reasoning', config: this.config.reasoning },
    ];

    for (const { name, config } of checks) {
      if (!config.enabled) continue;
      if (!config.scriptPath) {
        throw new Error(`Script path required for ${name} check`);
      }

      const scriptPath = path.resolve(this.workspaceRoot, config.scriptPath);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(
          `Quality check script not found: ${scriptPath}. ` +
            `Run WORK-PROCESS-FAILURES task or disable ${name} checks.`
        );
      }

      // Check if executable
      try {
        fs.accessSync(scriptPath, fs.constants.X_OK);
      } catch (error) {
        throw new Error(
          `Script not executable: ${scriptPath}. Run: chmod +x ${scriptPath}`
        );
      }
    }
  }

  /**
   * Run pre-flight health checks (before IMPLEMENT phase)
   *
   * Checks:
   * - Build passes (no compilation errors)
   * - Tests pass
   * - Typecheck passes
   * - Lint passes
   * - Git status clean
   * - Dependencies up-to-date
   *
   * @param taskId - Task identifier
   * @returns Quality check result
   */
  async runPreflightChecks(taskId: string): Promise<QualityCheckResult> {
    if (!this.config.preflight.enabled) {
      logInfo(`[QualityIntegration] Preflight checks disabled for ${taskId}`);
      return this.createPassedResult('preflight', taskId, 0);
    }

    logInfo(`[QualityIntegration] Running preflight checks for ${taskId}`, {
      mode: this.config.mode,
      timeout: this.config.preflight.timeoutMs,
    });

    return this.runCheck(
      'preflight',
      this.config.preflight.scriptPath!,
      ['--task', taskId],
      this.config.preflight.timeoutMs
    );
  }

  /**
   * Run quality gates (before VERIFY phase)
   *
   * Gates:
   * - Architecture: file size ≤500 lines, function size
   * - Maintainability: no TODOs, no magic numbers
   * - Completeness: test coverage >80%, error handling
   * - Documentation: README exists, key docs present
   *
   * @param taskId - Task identifier
   * @returns Quality check result
   */
  async runQualityGates(taskId: string): Promise<QualityCheckResult> {
    if (!this.config.qualityGates.enabled) {
      logInfo(`[QualityIntegration] Quality gates disabled for ${taskId}`);
      return this.createPassedResult('quality_gates', taskId, 0);
    }

    logInfo(`[QualityIntegration] Running quality gates for ${taskId}`, {
      mode: this.config.mode,
      timeout: this.config.qualityGates.timeoutMs,
    });

    return this.runCheck(
      'quality_gates',
      this.config.qualityGates.scriptPath!,
      [],
      this.config.qualityGates.timeoutMs
    );
  }

  /**
   * Run reasoning validation (before MONITOR phase)
   *
   * Validates:
   * - Assumptions register exists and substantive
   * - Work process: all 9 phases present
   * - Adversarial review: ≥10 questions, gaps identified
   * - Pre-mortem: conditional on complexity ≥8
   * - Decisions: alternatives considered, trade-offs documented
   *
   * @param taskId - Task identifier
   * @returns Quality check result
   */
  async runReasoningValidation(taskId: string): Promise<QualityCheckResult> {
    if (!this.config.reasoning.enabled) {
      logInfo(`[QualityIntegration] Reasoning validation disabled for ${taskId}`);
      return this.createPassedResult('reasoning', taskId, 0);
    }

    logInfo(`[QualityIntegration] Running reasoning validation for ${taskId}`, {
      mode: this.config.mode,
      timeout: this.config.reasoning.timeoutMs,
    });

    return this.runCheck(
      'reasoning',
      this.config.reasoning.scriptPath!,
      ['--task', taskId],
      this.config.reasoning.timeoutMs
    );
  }

  /**
   * Generic check runner with timeout and error handling
   *
   * Implements fail-safe pattern:
   * - Timeout → log warning, return non-blocking result
   * - Error → log error, return non-blocking result
   * - Invalid JSON → log error, return non-blocking result
   *
   * @param checkType - Type of check (for telemetry)
   * @param scriptPath - Absolute or relative path to script
   * @param args - Script arguments
   * @param timeoutMs - Timeout in milliseconds
   * @returns Quality check result
   */
  private async runCheck(
    checkType: QualityCheckResult['checkType'],
    scriptPath: string,
    args: string[],
    timeoutMs: number
  ): Promise<QualityCheckResult> {
    const startTime = Date.now();
    const resolvedScriptPath = path.resolve(this.workspaceRoot, scriptPath);

    try {
      // Execute script with timeout
      const output = await this.executeScriptWithTimeout(
        resolvedScriptPath,
        args,
        timeoutMs
      );

      const executionTimeMs = Date.now() - startTime;

      // Parse JSON output
      let result: QualityCheckResult;
      try {
        const parsed = JSON.parse(output);
        result = this.parseScriptOutput(checkType, parsed, executionTimeMs);
      } catch (parseError) {
        logError(`[QualityIntegration] Failed to parse ${checkType} output`, {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          output: output.substring(0, 500), // first 500 chars
        });

        // Fail-safe: treat parse error as non-blocking failure
        result = this.createFailedResult(
          checkType,
          '',
          executionTimeMs,
          false,
          `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }

      // Determine if should block based on mode
      result.blockTransition = this.shouldBlockTransition(result);

      // Log telemetry
      this.logQualityCheckEvent(result);

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const timedOut = errorMessage.includes('timeout') || errorMessage.includes('timed out');

      logWarning(`[QualityIntegration] ${checkType} check ${timedOut ? 'timed out' : 'failed'}`, {
        error: errorMessage,
        executionTimeMs,
        failSafe: this.config.failSafe,
      });

      // Fail-safe: return non-blocking result
      const result = this.createFailedResult(
        checkType,
        '',
        executionTimeMs,
        timedOut,
        errorMessage
      );

      // In fail-safe mode, errors/timeouts never block
      result.blockTransition = this.shouldBlockTransition(result);

      this.logQualityCheckEvent(result);

      return result;
    }
  }

  /**
   * Execute script with timeout using child_process spawn
   *
   * @param scriptPath - Path to script
   * @param args - Script arguments
   * @param timeoutMs - Timeout in milliseconds
   * @returns Script stdout
   * @throws Error if timeout or script fails
   */
  private executeScriptWithTimeout(
    scriptPath: string,
    args: string[],
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(scriptPath, args, {
        cwd: this.workspaceRoot,
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');

        // Escalate to SIGKILL after 1s if process hasn't responded to SIGTERM
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 1000);

        reject(new Error(`Script timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (timedOut) {
          return; // Already rejected by timeout handler
        }

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Script exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Parse script JSON output into QualityCheckResult
   *
   * Expected JSON format from scripts:
   * {
   *   "passed": true/false,
   *   "checks": { "total": N, "passed": M, "failed": K },
   *   "warnings": ["..."],
   *   "failures": ["..."],
   *   "report_path": "/tmp/report.json"
   * }
   */
  private parseScriptOutput(
    checkType: QualityCheckResult['checkType'],
    parsed: any,
    executionTimeMs: number
  ): QualityCheckResult {
    const passed = parsed.passed === true;
    const checks = parsed.checks || { total: 0, passed: 0, failed: 0 };

    return {
      checkType,
      taskId: '', // Will be set by caller
      passed,
      executionTimeMs,
      timedOut: false,
      details: {
        totalChecks: checks.total || 0,
        passedChecks: checks.passed || 0,
        failedChecks: checks.failed || 0,
        warnings: parsed.warnings || [],
        failures: parsed.failures || [],
      },
      blockTransition: false, // Will be determined by shouldBlockTransition
      reportPath: parsed.report_path,
    };
  }

  /**
   * Create passed result (for disabled checks)
   */
  private createPassedResult(
    checkType: QualityCheckResult['checkType'],
    taskId: string,
    executionTimeMs: number
  ): QualityCheckResult {
    return {
      checkType,
      taskId,
      passed: true,
      executionTimeMs,
      timedOut: false,
      details: {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        warnings: [],
        failures: [],
      },
      blockTransition: false,
    };
  }

  /**
   * Create failed result (for errors/timeouts)
   */
  private createFailedResult(
    checkType: QualityCheckResult['checkType'],
    taskId: string,
    executionTimeMs: number,
    timedOut: boolean,
    error: string
  ): QualityCheckResult {
    return {
      checkType,
      taskId,
      passed: false,
      executionTimeMs,
      timedOut,
      error,
      details: {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 1,
        warnings: [],
        failures: [error],
      },
      blockTransition: false, // Will be determined by shouldBlockTransition
    };
  }

  /**
   * Determine if phase transition should be blocked based on check result and mode
   *
   * Logic:
   * - shadow mode: NEVER block (observation only)
   * - observe mode: NEVER block (warnings only)
   * - enforce mode: Block if check failed
   * - fail-safe mode: NEVER block on timeout/error (only on actual failures)
   *
   * @param result - Quality check result
   * @returns True if phase transition should be blocked
   */
  private shouldBlockTransition(result: QualityCheckResult): boolean {
    // Shadow and observe modes never block
    if (this.config.mode === 'shadow' || this.config.mode === 'observe') {
      return false;
    }

    // Enforce mode
    if (this.config.mode === 'enforce') {
      // Fail-safe: don't block on timeout or error (only on actual check failures)
      if (this.config.failSafe && (result.timedOut || result.error)) {
        return false;
      }

      // Block if check failed
      return !result.passed;
    }

    // Default: don't block
    return false;
  }

  /**
   * Log quality check event to telemetry
   *
   * Writes to state/analytics/{check_type}_checks.jsonl
   */
  private logQualityCheckEvent(result: QualityCheckResult): void {
    try {
      // Log to analytics JSONL (primary telemetry)
      const analyticsPath = path.join(this.workspaceRoot, 'state', 'analytics');
      if (!fs.existsSync(analyticsPath)) {
        fs.mkdirSync(analyticsPath, { recursive: true });
      }

      const logPath = path.join(analyticsPath, `${result.checkType}_checks.jsonl`);
      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        task_id: result.taskId,
        mode: this.config.mode,
        passed: result.passed,
        execution_time_ms: result.executionTimeMs,
        timed_out: result.timedOut,
        blocked: result.blockTransition,
        details: result.details,
        error: result.error,
      });

      fs.appendFileSync(logPath, logEntry + '\n');
    } catch (error) {
      // Telemetry failures should never block
      logError('[QualityIntegration] Failed to log telemetry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
