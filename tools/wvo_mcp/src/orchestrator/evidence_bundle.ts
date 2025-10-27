/**
 * Evidence Bundle Generator
 *
 * Automatically generates comprehensive evidence documentation for each task.
 * Evidence bundles provide objective proof that work was completed to world-class standards.
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VerificationCommand {
  name: string;
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  passed: boolean;
}

export interface EvidenceBundle {
  task_id: string;
  task_title: string;
  generated_at: string;
  verification_commands: VerificationCommand[];
  artifacts_generated: string[];
  metrics_achieved: Record<string, any>;
  tests_passed: string[];
  tests_failed: string[];
  critics_passed: string[];
  critics_failed: string[];
  limitations: string[];
  next_steps: string[];
  overall_status: 'PASS' | 'FAIL' | 'PARTIAL';
}

export class EvidenceBundleGenerator {
  private workspaceRoot: string;
  private evidenceDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.evidenceDir = path.join(workspaceRoot, 'docs', 'evidence');
  }

  /**
   * Generate evidence bundle markdown document
   */
  async generate(bundle: EvidenceBundle): Promise<string> {
    await this.ensureEvidenceDir();

    const markdown = this.generateMarkdown(bundle);
    const filename = `${bundle.task_id.replace(/\./g, '_')}_evidence.md`;
    const filepath = path.join(this.evidenceDir, filename);

    await fs.writeFile(filepath, markdown, 'utf-8');

    return filepath;
  }

  private async ensureEvidenceDir(): Promise<void> {
    try {
      await fs.mkdir(this.evidenceDir, { recursive: true });
    } catch (error) {
      // Directory exists, ignore
    }
  }

  private generateMarkdown(bundle: EvidenceBundle): string {
    const md: string[] = [];

    // Header
    md.push(`# Evidence Bundle: ${bundle.task_id}`);
    md.push('');
    md.push(`**Task**: ${bundle.task_title}`);
    md.push(`**Generated**: ${bundle.generated_at}`);
    md.push(`**Status**: ${this.getStatusEmoji(bundle.overall_status)} ${bundle.overall_status}`);
    md.push('');
    md.push('---');
    md.push('');

    // Task Summary
    md.push('## Task Summary');
    md.push('');
    md.push(`This evidence bundle documents the completion and verification of task ${bundle.task_id}.`);
    md.push('');

    // Verification Commands
    md.push('## Verification Commands Run');
    md.push('');
    if (bundle.verification_commands.length === 0) {
      md.push('*No verification commands executed*');
    } else {
      const passed = bundle.verification_commands.filter(c => c.passed).length;
      const total = bundle.verification_commands.length;
      md.push(`**Summary**: ${passed}/${total} verifications passed`);
      md.push('');

      for (const cmd of bundle.verification_commands) {
        md.push(`### ${this.getCheckEmoji(cmd.passed)} ${cmd.name}`);
        md.push('');
        md.push('```bash');
        md.push(cmd.command);
        md.push('```');
        md.push('');
        md.push(`**Exit Code**: ${cmd.exit_code}`);
        md.push(`**Duration**: ${(cmd.duration_ms / 1000).toFixed(2)}s`);
        md.push('');

        if (cmd.stdout) {
          md.push('<details>');
          md.push('<summary>Standard Output</summary>');
          md.push('');
          md.push('```');
          md.push(cmd.stdout.substring(0, 2000)); // Limit output
          if (cmd.stdout.length > 2000) {
            md.push('... (output truncated)');
          }
          md.push('```');
          md.push('</details>');
          md.push('');
        }

        if (cmd.stderr && cmd.stderr.length > 0) {
          md.push('<details>');
          md.push('<summary>Standard Error</summary>');
          md.push('');
          md.push('```');
          md.push(cmd.stderr.substring(0, 2000));
          if (cmd.stderr.length > 2000) {
            md.push('... (output truncated)');
          }
          md.push('```');
          md.push('</details>');
          md.push('');
        }
      }
    }

    // Artifacts Generated
    md.push('## Artifacts Generated');
    md.push('');
    if (bundle.artifacts_generated.length === 0) {
      md.push('*No artifacts documented*');
    } else {
      md.push(`Found ${bundle.artifacts_generated.length} artifact(s):`);
      md.push('');
      for (const artifact of bundle.artifacts_generated) {
        md.push(`- \`${artifact}\``);
      }
    }
    md.push('');

    // Metrics Achieved
    md.push('## Metrics Achieved');
    md.push('');
    if (Object.keys(bundle.metrics_achieved).length === 0) {
      md.push('*No metrics documented*');
    } else {
      md.push('| Metric | Value |');
      md.push('|--------|-------|');
      for (const [key, value] of Object.entries(bundle.metrics_achieved)) {
        const valueStr = typeof value === 'number' ? value.toFixed(3) : String(value);
        md.push(`| ${key} | ${valueStr} |`);
      }
    }
    md.push('');

    // Tests Passed/Failed
    md.push('## Tests');
    md.push('');
    const totalTests = bundle.tests_passed.length + bundle.tests_failed.length;
    if (totalTests === 0) {
      md.push('*No tests executed*');
    } else {
      md.push(`**Summary**: ${bundle.tests_passed.length}/${totalTests} tests passed`);
      md.push('');

      if (bundle.tests_passed.length > 0) {
        md.push('### ✅ Passed');
        md.push('');
        for (const test of bundle.tests_passed) {
          md.push(`- ${test}`);
        }
        md.push('');
      }

      if (bundle.tests_failed.length > 0) {
        md.push('### ❌ Failed');
        md.push('');
        for (const test of bundle.tests_failed) {
          md.push(`- ${test}`);
        }
        md.push('');
      }
    }

    // Critics Passed/Failed
    md.push('## Critics');
    md.push('');
    const totalCritics = bundle.critics_passed.length + bundle.critics_failed.length;
    if (totalCritics === 0) {
      md.push('*No critics executed*');
    } else {
      md.push(`**Summary**: ${bundle.critics_passed.length}/${totalCritics} critics passed`);
      md.push('');

      if (bundle.critics_passed.length > 0) {
        md.push('### ✅ Passed');
        md.push('');
        for (const critic of bundle.critics_passed) {
          md.push(`- ${critic}`);
        }
        md.push('');
      }

      if (bundle.critics_failed.length > 0) {
        md.push('### ❌ Failed');
        md.push('');
        for (const critic of bundle.critics_failed) {
          md.push(`- ${critic}`);
        }
        md.push('');
      }
    }

    // Limitations
    md.push('## Limitations');
    md.push('');
    if (bundle.limitations.length === 0) {
      md.push('*No limitations documented*');
    } else {
      for (const limitation of bundle.limitations) {
        md.push(`- ${limitation}`);
      }
    }
    md.push('');

    // Next Steps
    md.push('## Next Steps');
    md.push('');
    if (bundle.next_steps.length === 0) {
      md.push('*No next steps documented*');
    } else {
      for (const step of bundle.next_steps) {
        md.push(`- ${step}`);
      }
    }
    md.push('');

    // Footer
    md.push('---');
    md.push('');
    md.push('*This evidence bundle was automatically generated by the WeatherVane orchestration system.*');
    md.push('');

    return md.join('\n');
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'PASS': return '✅';
      case 'FAIL': return '❌';
      case 'PARTIAL': return '⚠️';
      default: return '❓';
    }
  }

  private getCheckEmoji(passed: boolean): string {
    return passed ? '✅' : '❌';
  }

  /**
   * Create evidence bundle from verification results
   */
  static async createFromVerification(
    taskId: string,
    taskTitle: string,
    verificationResults: any[],
    artifactPaths: string[],
    metricsExtracted: Record<string, any>,
    workspaceRoot: string
  ): Promise<string> {
    const generator = new EvidenceBundleGenerator(workspaceRoot);

    // Parse verification results into commands
    const commands: VerificationCommand[] = verificationResults.map(result => ({
      name: result.name || 'Unknown',
      command: result.command || '',
      exit_code: result.exit_code || 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      duration_ms: result.duration_ms || 0,
      passed: result.exit_code === 0
    }));

    // Determine overall status
    const allPassed = commands.every(c => c.passed);
    const somePassed = commands.some(c => c.passed);
    const overall_status = allPassed ? 'PASS' : (somePassed ? 'PARTIAL' : 'FAIL');

    const bundle: EvidenceBundle = {
      task_id: taskId,
      task_title: taskTitle,
      generated_at: new Date().toISOString(),
      verification_commands: commands,
      artifacts_generated: artifactPaths,
      metrics_achieved: metricsExtracted,
      tests_passed: [],
      tests_failed: [],
      critics_passed: [],
      critics_failed: [],
      limitations: [],
      next_steps: [],
      overall_status
    };

    return await generator.generate(bundle);
  }
}
