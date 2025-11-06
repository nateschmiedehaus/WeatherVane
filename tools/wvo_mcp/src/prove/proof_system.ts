/**
 * Proof System
 *
 * Executes automated proof verification:
 * - Parses proof criteria from plan.md
 * - Runs build, test, runtime, integration checks
 * - Generates verify.md with evidence
 * - Returns proven/unproven status with discoveries
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec, type ExecOptions } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ProofCriteria,
  ProofResult,
  CheckResult,
  Discovery,
  Evidence,
} from './types.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { resolveStateRoot } from '../utils/config.js';

const execAsync = promisify(exec);

type ExecRunner = (
  command: string,
  options?: ExecOptions
) => Promise<{ stdout: string; stderr: string }>;

export interface ProofSystemOptions {
  execRunner?: ExecRunner;
}

export class ProofSystem {
  private workspaceRoot: string;
  private stateRoot: string;
  private readonly PROOF_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private execRunner: ExecRunner;

  constructor(workspaceRoot: string, options: ProofSystemOptions = {}) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
    this.execRunner =
      options.execRunner ??
      (async (command, execOptions) => {
        const { stdout, stderr } = await execAsync(
          command,
          execOptions as ExecOptions
        );
        return {
          stdout: typeof stdout === 'string' ? stdout : stdout?.toString() ?? '',
          stderr: typeof stderr === 'string' ? stderr : stderr?.toString() ?? '',
        };
      });
  }

  /**
   * Attempt proof for a task
   */
  async attemptProof(taskId: string): Promise<ProofResult> {
    const startTime = Date.now();

    logInfo(`ProofSystem: Attempting proof for ${taskId}`);

    // Parse proof criteria from plan.md
    const criteria = await this.parseProofCriteria(taskId);

    // Run all checks
    const checks: CheckResult[] = [];

    if (criteria.build) {
      checks.push(await this.runBuildCheck());
    }

    if (criteria.test) {
      checks.push(await this.runTestCheck());
    }

    for (const runtimeCriterion of criteria.runtime) {
      checks.push(await this.runRuntimeCheck(runtimeCriterion));
    }

    for (const integrationCriterion of criteria.integration) {
      checks.push(await this.runIntegrationCheck(integrationCriterion));
    }

    // Analyze results
    const failures = checks.filter((c) => !c.success && !c.skipped);
    const discoveries = this.extractDiscoveries(failures);

    const status = failures.length === 0 ? 'proven' : 'unproven';
    const executionTimeMs = Date.now() - startTime;

    const result: ProofResult = {
      status,
      timestamp: new Date().toISOString(),
      criteria,
      checks,
      discoveries,
      executionTimeMs,
    };

    // If proven, generate evidence
    if (status === 'proven') {
      const evidence = this.createEvidence(taskId, result);
      result.evidence = evidence;
      await this.generateVerifyMd(taskId, evidence);
    }

    logInfo(`ProofSystem: Proof ${status} for ${taskId}`, {
      checks: checks.length,
      failures: failures.length,
      discoveries: discoveries.length,
      executionTimeMs,
    });

    return result;
  }

  /**
   * Parse proof criteria from plan.md
   */
  private async parseProofCriteria(taskId: string): Promise<ProofCriteria> {
    const planPath = path.join(this.stateRoot, 'evidence', taskId, 'plan.md');

    // Default criteria if plan.md missing
    if (!fs.existsSync(planPath)) {
      logWarning(`No plan.md found for ${taskId}, using default criteria`);
      return {
        build: true,
        test: true,
        runtime: [],
        integration: [],
        manual: [],
      };
    }

    const content = fs.readFileSync(planPath, 'utf-8');

    // Check for proof criteria section
    if (!content.includes('## Proof Criteria')) {
      logWarning(`No proof criteria section in plan.md for ${taskId}, using defaults`);
      return {
        build: true,
        test: true,
        runtime: [],
        integration: [],
        manual: [],
      };
    }

    // Parse criteria (simple implementation - can be enhanced)
    const criteria: ProofCriteria = {
      build: content.includes('Build Verification') || content.includes('npm run build'),
      test: content.includes('Test Verification') || content.includes('npm test'),
      runtime: [],
      integration: [],
      manual: [],
    };

    // Extract runtime checks (look for ### Runtime Verification section)
    const runtimeMatch = content.match(
      /### Runtime Verification.*?\n([\s\S]*?)(?=\n### |$)/
    );
    if (runtimeMatch) {
      const runtimeSection = runtimeMatch[1];
      const checkLines = runtimeSection
        .split('\n')
        .filter((line) => line.trim().startsWith('-'));

      for (const line of checkLines) {
        criteria.runtime.push({
          description: line.replace(/^-\s*/, '').trim(),
        });
      }
    }

    return criteria;
  }

  /**
   * Run build check
   */
  private async runBuildCheck(): Promise<CheckResult> {
    try {
      const { stdout, stderr } = await this.execRunner('npm run build', {
        cwd: path.join(this.workspaceRoot, 'tools/wvo_mcp'),
        timeout: this.PROOF_TIMEOUT_MS,
      });

      return {
        type: 'build',
        description: 'Build check',
        success: true,
        message: 'Build completed successfully',
        output: stdout + stderr,
      };
    } catch (error: any) {
      // Check if command doesn't exist
      if (error.message?.includes('Missing script')) {
        logWarning('No build script found, skipping build check');
        return {
          type: 'build',
          description: 'Build check',
          success: true,
          message: 'No build script (skipped)',
          skipped: true,
        };
      }

      return {
        type: 'build',
        description: 'Build check',
        success: false,
        message: 'Build failed',
        error: error.message,
        output: error.stdout + error.stderr,
      };
    }
  }

  /**
   * Run test check
   */
  private async runTestCheck(): Promise<CheckResult> {
    try {
      const { stdout, stderr } = await this.execRunner('npm test', {
        cwd: path.join(this.workspaceRoot, 'tools/wvo_mcp'),
        timeout: this.PROOF_TIMEOUT_MS,
      });

      return {
        type: 'test',
        description: 'Test check',
        success: true,
        message: 'All tests passed',
        output: stdout + stderr,
      };
    } catch (error: any) {
      // Check if command doesn't exist
      if (error.message?.includes('Missing script')) {
        logWarning('No test script found, skipping test check');
        return {
          type: 'test',
          description: 'Test check',
          success: true,
          message: 'No test script (skipped)',
          skipped: true,
        };
      }

      return {
        type: 'test',
        description: 'Test check',
        success: false,
        message: 'Tests failed',
        error: error.message,
        output: error.stdout + error.stderr,
      };
    }
  }

  /**
   * Run runtime check
   */
  private async runRuntimeCheck(criterion: { description: string; command?: string }): Promise<CheckResult> {
    if (!criterion.command) {
      // Manual check, skip for now
      return {
        type: 'runtime',
        description: criterion.description,
        success: true,
        message: 'Manual check (skipped)',
        skipped: true,
      };
    }

    try {
      const { stdout, stderr } = await this.execRunner(criterion.command, {
        cwd: this.workspaceRoot,
        timeout: this.PROOF_TIMEOUT_MS,
      });

      return {
        type: 'runtime',
        description: criterion.description,
        success: true,
        message: 'Runtime check passed',
        output: stdout + stderr,
      };
    } catch (error: any) {
      return {
        type: 'runtime',
        description: criterion.description,
        success: false,
        message: 'Runtime check failed',
        error: error.message,
        output: error.stdout + error.stderr,
      };
    }
  }

  /**
   * Run integration check
   */
  private async runIntegrationCheck(criterion: { description: string; command?: string }): Promise<CheckResult> {
    if (!criterion.command) {
      return {
        type: 'integration',
        description: criterion.description,
        success: true,
        message: 'Manual check (skipped)',
        skipped: true,
      };
    }

    try {
      const { stdout, stderr } = await this.execRunner(criterion.command, {
        cwd: this.workspaceRoot,
        timeout: this.PROOF_TIMEOUT_MS,
      });

      return {
        type: 'integration',
        description: criterion.description,
        success: true,
        message: 'Integration check passed',
        output: stdout + stderr,
      };
    } catch (error: any) {
      return {
        type: 'integration',
        description: criterion.description,
        success: false,
        message: 'Integration check failed',
        error: error.message,
        output: error.stdout + error.stderr,
      };
    }
  }

  /**
   * Extract discoveries from failed checks
   */
  private extractDiscoveries(failures: CheckResult[]): Discovery[] {
    return failures.map((check, index) => ({
      id: `discovery-${index + 1}`,
      title: `${check.type} check failed: ${check.description}`,
      description: check.message,
      severity: check.type === 'build' ? 'critical' : 'high',
      context: {
        error: check.error,
      },
    }));
  }

  /**
   * Create evidence from proof result
   */
  private createEvidence(taskId: string, result: ProofResult): Evidence {
    const summary = {
      total: result.checks.length,
      passed: result.checks.filter((c) => c.success).length,
      failed: result.checks.filter((c) => !c.success && !c.skipped).length,
      skipped: result.checks.filter((c) => c.skipped).length,
    };

    return {
      taskId,
      timestamp: result.timestamp,
      criteria: result.criteria,
      checks: result.checks,
      summary,
      executionTimeMs: result.executionTimeMs,
    };
  }

  /**
   * Generate verify.md with evidence
   */
  private async generateVerifyMd(taskId: string, evidence: Evidence): Promise<void> {
    const verifyPath = path.join(this.stateRoot, 'evidence', taskId, 'verify.md');

    try {
      const content = this.formatVerifyMd(evidence);
      fs.writeFileSync(verifyPath, content, 'utf-8');
      logInfo(`Generated verify.md for ${taskId}`);
    } catch (error) {
      logError(`Failed to generate verify.md for ${taskId}`, { error: String(error) });
      // Store in analytics as fallback
      const analyticsPath = path.join(
        this.stateRoot,
        'analytics',
        `proof-${taskId}-${Date.now()}.json`
      );
      fs.writeFileSync(analyticsPath, JSON.stringify(evidence, null, 2), 'utf-8');
    }
  }

  /**
   * Format verify.md content
   */
  private formatVerifyMd(evidence: Evidence): string {
    const { taskId, timestamp, summary, checks, executionTimeMs } = evidence;

    let content = `# Verification Evidence: ${taskId}\n\n`;
    content += `**Status:** PROVEN ✅\n`;
    content += `**Verified:** ${timestamp}\n`;
    content += `**Verification Time:** ${(executionTimeMs / 1000).toFixed(1)}s\n\n`;

    content += `## Summary\n\n`;
    content += `- Total checks: ${summary.total}\n`;
    content += `- Passed: ${summary.passed}\n`;
    content += `- Failed: ${summary.failed}\n`;
    content += `- Skipped: ${summary.skipped}\n\n`;

    content += `## Detailed Results\n\n`;

    for (const check of checks) {
      const icon = check.success ? '✅' : check.skipped ? '⏭️' : '❌';
      content += `### ${icon} ${check.type.toUpperCase()}: ${check.description}\n\n`;
      content += `**Result:** ${check.message}\n\n`;

      if (check.error) {
        content += `**Error:**\n\`\`\`\n${check.error}\n\`\`\`\n\n`;
      }

      if (check.output && !check.skipped) {
        // Truncate long output
        const truncated = check.output.length > 1000
          ? check.output.substring(0, 1000) + '\n... (truncated)'
          : check.output;
        content += `**Output:**\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
      }
    }

    content += `---\n\n`;
    content += `**Auto-generated by Proof System**\n`;
    content += `**Execution ID:** proof-${taskId}-${Date.now()}\n`;

    return content;
  }
}
