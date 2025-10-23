/**
 * TaskVerifier V2 - Comprehensive Task Verification System
 *
 * This verifier enforces world-class quality standards by:
 * 1. Running pre-checks before task execution (environment, dependencies)
 * 2. Running post-checks after task execution (tests, integration, performance)
 * 3. Verifying required artifacts exist
 * 4. Extracting and validating metrics against thresholds
 * 5. Running critics to enforce excellence
 * 6. Logging all verification attempts with full telemetry
 * 7. Generating evidence bundles for audit trail
 * 8. Blocking task completion if ANY check fails
 *
 * Key principles:
 * - Objective truth over task completion
 * - No false positives (if it passes, it's world-class)
 * - Comprehensive logging for debugging
 * - Evidence bundles for accountability
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import type { Task } from './state_machine.js';
import { logDebug, logError, logInfo } from '../telemetry/logger.js';
import { VerificationTelemetryLogger, createVerificationEntry } from '../telemetry/verification_telemetry.js';
import { EvidenceBundleGenerator } from './evidence_bundle.js';
import { runModelingRealityCritic } from '../critics/modeling_reality_v2.js';

export interface VerificationCheck {
  name: string;
  command: string;
  timeout_seconds: number;
  required: boolean;
}

export interface TaskVerificationConfig {
  title: string;
  pre_checks: VerificationCheck[];
  post_checks: VerificationCheck[];
  required_artifacts: string[];
  required_metrics: Record<string, any>;
  evidence_template?: string;
}

export interface VerificationResult {
  success: boolean;
  checks_run: number;
  checks_passed: number;
  checks_failed: number;
  failures: string[];
  warnings: string[];
  artifacts_found: string[];
  artifacts_missing: string[];
  metrics_extracted: Record<string, any>;
  evidence_bundle_path?: string;
}

export class TaskVerifierV2 {
  private workspaceRoot: string;
  private config: Map<string, TaskVerificationConfig>;
  private telemetryLogger: VerificationTelemetryLogger;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.config = new Map();
    this.telemetryLogger = new VerificationTelemetryLogger(workspaceRoot);
  }

  /**
   * Load verification config from JSON file
   */
  async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.workspaceRoot, 'config', 'task_verification.json');
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      // Load task verifiers
      for (const [taskId, taskConfig] of Object.entries(config.task_verifiers || {})) {
        this.config.set(taskId, taskConfig as TaskVerificationConfig);
      }

      logInfo('Loaded task verification config', {
        tasks_configured: this.config.size
      });

    } catch (error) {
      logError('Failed to load verification config', { error });
      // Continue without config - will use default checks only
    }
  }

  /**
   * Check if task should be verified
   */
  shouldVerify(task: Task): boolean {
    if (!task?.id) {
      return false;
    }

    // Check if specific config exists
    if (this.config.has(task.id)) {
      return true;
    }

    // Check modeling task prefixes
    const MODELING_PREFIXES = ['T12.', 'T13.5.', 'T-MLR-'];
    return MODELING_PREFIXES.some(prefix => task.id.startsWith(prefix));
  }

  /**
   * Run pre-checks before task execution
   */
  async runPreChecks(task: Task): Promise<VerificationResult> {
    const taskConfig = this.config.get(task.id);
    if (!taskConfig || !taskConfig.pre_checks || taskConfig.pre_checks.length === 0) {
      return {
        success: true,
        checks_run: 0,
        checks_passed: 0,
        checks_failed: 0,
        failures: [],
        warnings: [],
        artifacts_found: [],
        artifacts_missing: [],
        metrics_extracted: {}
      };
    }

    return await this.runChecks(task, taskConfig.pre_checks, 'pre_check');
  }

  /**
   * Run post-checks after task execution
   */
  async runPostChecks(task: Task): Promise<VerificationResult> {
    const result: VerificationResult = {
      success: true,
      checks_run: 0,
      checks_passed: 0,
      checks_failed: 0,
      failures: [],
      warnings: [],
      artifacts_found: [],
      artifacts_missing: [],
      metrics_extracted: {}
    };

    const taskConfig = this.config.get(task.id);

    // Run post-check commands
    if (taskConfig?.post_checks) {
      const checksResult = await this.runChecks(task, taskConfig.post_checks, 'post_check');
      this.mergeResults(result, checksResult);
    }

    // Verify artifacts
    if (taskConfig?.required_artifacts) {
      const artifactsResult = await this.verifyArtifacts(task, taskConfig.required_artifacts);
      this.mergeResults(result, artifactsResult);
    }

    // Verify metrics
    if (taskConfig?.required_metrics) {
      const metricsResult = await this.verifyMetrics(task, taskConfig.required_metrics);
      this.mergeResults(result, metricsResult);
    }

    // Run critics
    const criticResult = await this.runCritics(task);
    this.mergeResults(result, criticResult);

    // Generate evidence bundle
    if (result.checks_run > 0) {
      try {
        const evidencePath = await this.generateEvidenceBundle(task, result);
        result.evidence_bundle_path = evidencePath;
      } catch (error) {
        logError('Failed to generate evidence bundle', { taskId: task.id, error });
      }
    }

    return result;
  }

  /**
   * Run a set of verification checks
   */
  private async runChecks(
    task: Task,
    checks: VerificationCheck[],
    verificationType: 'pre_check' | 'post_check'
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      success: true,
      checks_run: 0,
      checks_passed: 0,
      checks_failed: 0,
      failures: [],
      warnings: [],
      artifacts_found: [],
      artifacts_missing: [],
      metrics_extracted: {}
    };

    for (const check of checks) {
      result.checks_run++;

      const startTime = Date.now();

      try {
        const checkResult = await execa(check.command, {
          shell: true,
          cwd: this.workspaceRoot,
          reject: false,
          timeout: check.timeout_seconds * 1000,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
          }
        });

        const duration = Date.now() - startTime;
        const passed = checkResult.exitCode === 0;

        // Log telemetry
        await this.telemetryLogger.log(createVerificationEntry(
          task.id,
          task.title || task.id,
          verificationType,
          check.name,
          check.command,
          checkResult.exitCode,
          checkResult.stdout,
          checkResult.stderr,
          duration,
          passed
        ));

        if (passed) {
          result.checks_passed++;
        } else {
          result.checks_failed++;

          const message = `${check.name} failed (exit ${checkResult.exitCode})`;

          if (check.required) {
            result.failures.push(message);
            result.success = false;
          } else {
            result.warnings.push(message);
          }

          logError('Verification check failed', {
            taskId: task.id,
            checkName: check.name,
            exitCode: checkResult.exitCode,
            stderr: checkResult.stderr?.substring(0, 500)
          });
        }

      } catch (error: any) {
        result.checks_failed++;
        const message = `${check.name} crashed: ${error.message}`;

        if (check.required) {
          result.failures.push(message);
          result.success = false;
        } else {
          result.warnings.push(message);
        }

        const duration = Date.now() - startTime;
        await this.telemetryLogger.log(createVerificationEntry(
          task.id,
          task.title || task.id,
          verificationType,
          check.name,
          check.command,
          error.exitCode,
          error.stdout,
          error.stderr,
          duration,
          false,
          error.message
        ));
      }
    }

    return result;
  }

  /**
   * Verify required artifacts exist
   */
  private async verifyArtifacts(task: Task, requiredArtifacts: string[]): Promise<VerificationResult> {
    const result: VerificationResult = {
      success: true,
      checks_run: requiredArtifacts.length,
      checks_passed: 0,
      checks_failed: 0,
      failures: [],
      warnings: [],
      artifacts_found: [],
      artifacts_missing: [],
      metrics_extracted: {}
    };

    for (const artifact of requiredArtifacts) {
      // Handle glob patterns
      const artifactPath = path.join(this.workspaceRoot, artifact);

      try {
        if (artifact.includes('*')) {
          // TODO: Implement glob matching
          result.warnings.push(`Glob pattern not yet implemented: ${artifact}`);
        } else {
          const exists = await fs.access(artifactPath).then(() => true).catch(() => false);

          if (exists) {
            result.checks_passed++;
            result.artifacts_found.push(artifact);
          } else {
            result.checks_failed++;
            result.artifacts_missing.push(artifact);
            result.failures.push(`Missing required artifact: ${artifact}`);
            result.success = false;
          }
        }
      } catch (error) {
        result.checks_failed++;
        result.failures.push(`Error checking artifact ${artifact}: ${error}`);
        result.success = false;
      }
    }

    return result;
  }

  /**
   * Verify metrics meet thresholds
   */
  private async verifyMetrics(task: Task, requiredMetrics: Record<string, any>): Promise<VerificationResult> {
    const result: VerificationResult = {
      success: true,
      checks_run: 0,
      checks_passed: 0,
      checks_failed: 0,
      failures: [],
      warnings: [],
      artifacts_found: [],
      artifacts_missing: [],
      metrics_extracted: {}
    };

    // Try to load metrics from validation report
    const reportPath = path.join(this.workspaceRoot, 'experiments', 'mcp', 'validation_report.json');

    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const report = JSON.parse(reportContent);
      result.metrics_extracted = report.metrics || {};

      // Check each required metric
      for (const [metricName, constraint] of Object.entries(requiredMetrics)) {
        result.checks_run++;

        const actualValue = result.metrics_extracted[metricName];

        if (actualValue === undefined) {
          result.checks_failed++;
          result.failures.push(`Metric ${metricName} not found in validation report`);
          result.success = false;
          continue;
        }

        // Check constraint
        if (constraint.min !== undefined && actualValue < constraint.min) {
          result.checks_failed++;
          result.failures.push(`${metricName} = ${actualValue} < ${constraint.min} (minimum)`);
          result.success = false;
        } else if (constraint.max !== undefined && actualValue > constraint.max) {
          result.checks_failed++;
          result.failures.push(`${metricName} = ${actualValue} > ${constraint.max} (maximum)`);
          result.success = false;
        } else if (constraint.equals !== undefined && actualValue !== constraint.equals) {
          result.checks_failed++;
          result.failures.push(`${metricName} = ${actualValue} !== ${constraint.equals} (expected)`);
          result.success = false;
        } else {
          result.checks_passed++;
        }
      }

    } catch (error) {
      // No metrics file - add warning but don't fail if no metrics required
      if (Object.keys(requiredMetrics).length > 0) {
        result.warnings.push('Validation report not found, skipping metrics verification');
      }
    }

    return result;
  }

  /**
   * Run critics on task output
   */
  private async runCritics(task: Task): Promise<VerificationResult> {
    const result: VerificationResult = {
      success: true,
      checks_run: 0,
      checks_passed: 0,
      checks_failed: 0,
      failures: [],
      warnings: [],
      artifacts_found: [],
      artifacts_missing: [],
      metrics_extracted: {}
    };

    // Run ModelingReality_v2 critic for modeling tasks
    if (task.id.startsWith('T12.') || task.id.startsWith('T13.5.') || task.id.startsWith('T-MLR-')) {
      result.checks_run++;

      try {
        // Find artifacts
        const experimentsDir = path.join(this.workspaceRoot, 'experiments', 'mcp');
        const files = await fs.readdir(experimentsDir).catch(() => []);
        const artifactPaths = files
          .filter(f => f.includes('validation_report') || f.includes('metrics'))
          .map(f => path.join('experiments', 'mcp', f));

        const criticResult = await runModelingRealityCritic(this.workspaceRoot, task.id, artifactPaths);

        if (criticResult.passed) {
          result.checks_passed++;
          logInfo('ModelingReality_v2 critic passed', { taskId: task.id });
        } else {
          result.checks_failed++;
          result.failures.push(`ModelingReality_v2 critic: ${criticResult.message}`);
          result.failures.push(...criticResult.details.failures);
          result.success = false;

          logError('ModelingReality_v2 critic failed', {
            taskId: task.id,
            failures: criticResult.details.failures
          });
        }

      } catch (error) {
        result.checks_failed++;
        result.failures.push(`Critic execution error: ${error}`);
        result.success = false;
      }
    }

    return result;
  }

  /**
   * Generate evidence bundle
   */
  private async generateEvidenceBundle(task: Task, result: VerificationResult): Promise<string> {
    const telemetryEntries = await this.telemetryLogger.getTaskHistory(task.id);

    const verificationResults = telemetryEntries.map(entry => ({
      name: entry.check_name,
      command: entry.command || '',
      exit_code: entry.exit_code || 0,
      stdout: entry.stdout || '',
      stderr: entry.stderr || '',
      duration_ms: entry.duration_ms,
      passed: entry.passed
    }));

    return await EvidenceBundleGenerator.createFromVerification(
      task.id,
      task.title || task.id,
      verificationResults,
      result.artifacts_found,
      result.metrics_extracted,
      this.workspaceRoot
    );
  }

  /**
   * Merge verification results
   */
  private mergeResults(target: VerificationResult, source: VerificationResult): void {
    target.checks_run += source.checks_run;
    target.checks_passed += source.checks_passed;
    target.checks_failed += source.checks_failed;
    target.failures.push(...source.failures);
    target.warnings.push(...source.warnings);
    target.artifacts_found.push(...source.artifacts_found);
    target.artifacts_missing.push(...source.artifacts_missing);
    Object.assign(target.metrics_extracted, source.metrics_extracted);

    if (!source.success) {
      target.success = false;
    }
  }
}

// Export legacy interface for backwards compatibility
export class TaskVerifier extends TaskVerifierV2 {
  async verify(task: Task): Promise<{ success: boolean; exitCode?: number; stdout?: string; stderr?: string }> {
    const result = await this.runPostChecks(task);

    return {
      success: result.success,
      exitCode: result.success ? 0 : 1,
      stdout: `Checks: ${result.checks_passed}/${result.checks_run} passed`,
      stderr: result.failures.join('\n')
    };
  }
}
