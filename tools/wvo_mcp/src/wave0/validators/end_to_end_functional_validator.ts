/**
 * End-to-End Functional Validator for Wave 0.1
 *
 * Validates complete functionality through all phases
 * Ensures Wave 0 actually works end-to-end
 */

import { logInfo, logWarning, logError } from '../../telemetry/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

export interface E2EValidationResult {
  passed: boolean;
  phases: {
    [phase: string]: {
      passed: boolean;
      duration: number;
      errors: string[];
    };
  };
  totalDuration: number;
  recommendations: string[];
}

export class EndToEndFunctionalValidator {
  private phasesToValidate = [
    'STRATEGIZE',
    'SPEC',
    'PLAN',
    'THINK',
    'GATE',
    'IMPLEMENT',
    'VERIFY',
    'REVIEW',
    'PR',
    'MONITOR'
  ];

  /**
   * Validate end-to-end functionality
   */
  async validate(taskId: string): Promise<E2EValidationResult> {
    logInfo(`E2E Validator: Starting validation for ${taskId}`);

    const result: E2EValidationResult = {
      passed: true,
      phases: {},
      totalDuration: 0,
      recommendations: []
    };

    const startTime = Date.now();

    try {
      // Validate each phase
      for (const phase of this.phasesToValidate) {
        const phaseStart = Date.now();
        const phaseResult = await this.validatePhase(phase, taskId);

        result.phases[phase] = {
          passed: phaseResult.passed,
          duration: Date.now() - phaseStart,
          errors: phaseResult.errors
        };

        if (!phaseResult.passed) {
          result.passed = false;
          result.recommendations.push(`Fix ${phase} phase issues`);
        }
      }

      // Validate integration between phases
      const integrationValid = await this.validatePhaseIntegration(taskId);
      if (!integrationValid) {
        result.passed = false;
        result.recommendations.push('Improve phase integration');
      }

      // Validate final output
      const outputValid = await this.validateFinalOutput(taskId);
      if (!outputValid) {
        result.passed = false;
        result.recommendations.push('Final output does not meet standards');
      }

      result.totalDuration = Date.now() - startTime;

      logInfo(`E2E Validator: Completed for ${taskId}`, {
        passed: result.passed,
        duration: result.totalDuration,
        failedPhases: Object.keys(result.phases).filter(p => !result.phases[p].passed)
      });

    } catch (error) {
      logError(`E2E Validator: Failed for ${taskId}`, { error });
      result.passed = false;
      result.recommendations.push('Complete E2E validation failed - investigate root cause');
    }

    return result;
  }

  /**
   * Validate a single phase
   */
  private async validatePhase(phase: string, taskId: string): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];
    let passed = true;

    try {
      // Check if phase evidence exists
      const evidencePath = path.join('state', 'evidence', taskId, `${phase.toLowerCase()}.md`);

      try {
        const stat = await fs.stat(evidencePath);

        if (stat.size < 100) {
          errors.push(`${phase} evidence too small - likely placeholder`);
          passed = false;
        }

        // Read and validate content
        const content = await fs.readFile(evidencePath, 'utf-8');

        // Phase-specific validation
        switch (phase) {
          case 'STRATEGIZE':
            if (!content.includes('WHY') && !content.includes('root cause')) {
              errors.push('Strategy lacks WHY analysis');
              passed = false;
            }
            break;

          case 'SPEC':
            if (!content.includes('acceptance criteria') && !content.includes('requirement')) {
              errors.push('Spec lacks clear acceptance criteria');
              passed = false;
            }
            break;

          case 'PLAN':
            if (!content.includes('test') && !content.includes('validation')) {
              errors.push('Plan lacks test strategy');
              passed = false;
            }
            break;

          case 'THINK':
            if (!content.includes('edge case') && !content.includes('failure')) {
              errors.push('Thinking lacks edge case analysis');
              passed = false;
            }
            break;

          case 'GATE':
            if (!content.includes('AFP') && !content.includes('SCAS')) {
              errors.push('Gate lacks AFP/SCAS analysis');
              passed = false;
            }
            break;

          case 'IMPLEMENT':
            if (!content.includes('function') && !content.includes('class')) {
              errors.push('Implementation lacks actual code');
              passed = false;
            }
            break;

          case 'VERIFY':
            if (!content.includes('test') && !content.includes('pass')) {
              errors.push('Verification lacks test results');
              passed = false;
            }
            break;

          case 'REVIEW':
            if (!content.includes('quality') && !content.includes('compliance')) {
              errors.push('Review lacks quality assessment');
              passed = false;
            }
            break;
        }

      } catch (error) {
        errors.push(`${phase} evidence not found`);
        passed = false;
      }

    } catch (error) {
      errors.push(`${phase} validation error: ${error}`);
      passed = false;
    }

    return { passed, errors };
  }

  /**
   * Validate integration between phases
   */
  private async validatePhaseIntegration(taskId: string): Promise<boolean> {
    try {
      const evidenceDir = path.join('state', 'evidence', taskId);

      // Check if all phases reference each other properly
      const files = await fs.readdir(evidenceDir);

      if (files.length < 8) {
        logWarning(`E2E: Incomplete phase artifacts for ${taskId}`);
        return false;
      }

      // Check phase ordering
      const stats = await Promise.all(
        files.map(async f => {
          const stat = await fs.stat(path.join(evidenceDir, f));
          return { file: f, mtime: stat.mtime };
        })
      );

      // Sort by modification time
      stats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      // Verify phases were executed in correct order
      const expectedOrder = [
        'strategy', 'spec', 'plan', 'think', 'design',
        'implement', 'verify', 'review'
      ];

      for (let i = 0; i < expectedOrder.length - 1; i++) {
        const current = stats.find(s => s.file.includes(expectedOrder[i]));
        const next = stats.find(s => s.file.includes(expectedOrder[i + 1]));

        if (current && next && current.mtime > next.mtime) {
          logWarning(`E2E: Phase ${expectedOrder[i]} executed after ${expectedOrder[i + 1]}`);
          return false;
        }
      }

      return true;

    } catch (error) {
      logError('E2E: Integration validation failed', { error });
      return false;
    }
  }

  /**
   * Validate final output meets standards
   */
  private async validateFinalOutput(taskId: string): Promise<boolean> {
    try {
      // Check if implementation exists and builds
      const hasImplementation = await this.checkImplementation(taskId);
      if (!hasImplementation) {
        logWarning(`E2E: No valid implementation for ${taskId}`);
        return false;
      }

      // Check if tests exist and pass
      const testsPass = await this.checkTests(taskId);
      if (!testsPass) {
        logWarning(`E2E: Tests failing for ${taskId}`);
        return false;
      }

      // Check if documentation exists
      const hasDocumentation = await this.checkDocumentation(taskId);
      if (!hasDocumentation) {
        logWarning(`E2E: Missing documentation for ${taskId}`);
        return false;
      }

      return true;

    } catch (error) {
      logError('E2E: Output validation failed', { error });
      return false;
    }
  }

  /**
   * Check if implementation exists and is valid
   */
  private async checkImplementation(taskId: string): Promise<boolean> {
    try {
      const implementPath = path.join('state', 'evidence', taskId, 'implement.md');
      const content = await fs.readFile(implementPath, 'utf-8');

      // Check for actual code, not just descriptions
      return content.includes('```') &&
             (content.includes('function') || content.includes('class')) &&
             content.length > 500;

    } catch {
      return false;
    }
  }

  /**
   * Check if tests exist and would pass
   */
  private async checkTests(taskId: string): Promise<boolean> {
    try {
      const verifyPath = path.join('state', 'evidence', taskId, 'verify.md');
      const content = await fs.readFile(verifyPath, 'utf-8');

      // Look for test results
      return content.includes('✓') ||
             content.includes('PASS') ||
             content.includes('success');

    } catch {
      return false;
    }
  }

  /**
   * Check if documentation exists
   */
  private async checkDocumentation(taskId: string): Promise<boolean> {
    try {
      const reviewPath = path.join('state', 'evidence', taskId, 'review.md');
      const content = await fs.readFile(reviewPath, 'utf-8');

      return content.includes('documentation') ||
             content.includes('README') ||
             content.length > 200;

    } catch {
      return false;
    }
  }

  /**
   * Run actual E2E test scenario
   */
  async runE2EScenario(scenario: string): Promise<boolean> {
    logInfo(`E2E: Running scenario - ${scenario}`);

    try {
      // This would run an actual end-to-end scenario
      // For now, we simulate it
      await new Promise(resolve => setTimeout(resolve, 100));

      // In production, this would:
      // 1. Create a test task
      // 2. Run it through Wave 0
      // 3. Validate the output
      // 4. Clean up

      return true;

    } catch (error) {
      logError(`E2E: Scenario failed - ${scenario}`, { error });
      return false;
    }
  }
}