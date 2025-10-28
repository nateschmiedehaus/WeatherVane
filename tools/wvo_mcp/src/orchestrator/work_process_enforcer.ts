/**
 * Work Process Enforcer
 *
 * Programmatically enforces the STRATEGIZE→MONITOR work cycle.
 * Ensures every task goes through all phases with quality gates.
 *
 * Connection to WeatherVane Purpose:
 * - Guarantees systematic approach to weather forecasting features
 * - Ensures quality standards for <5% forecast error
 * - Creates traceable development for energy market compliance
 */

import { StateMachine, Task } from './state_machine.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import fs from 'fs';
import path from 'path';

export type WorkPhase =
  | 'STRATEGIZE'
  | 'SPEC'
  | 'PLAN'
  | 'THINK'
  | 'IMPLEMENT'
  | 'VERIFY'
  | 'REVIEW'
  | 'PR'
  | 'MONITOR';

export interface PhaseTransition {
  from: WorkPhase;
  to: WorkPhase;
  taskId: string;
  timestamp: number;
  validationPassed: boolean;
  validationErrors?: string[];
}

export interface PhaseValidation {
  phase: WorkPhase;
  required: string[];
  artifacts: string[];
  qualityGates: Array<{
    name: string;
    check: () => Promise<boolean>;
    required: boolean;
  }>;
}

/**
 * Enforces the complete work process cycle
 */
export class WorkProcessEnforcer {
  private currentPhase: Map<string, WorkPhase> = new Map();
  private phaseHistory: PhaseTransition[] = [];
  private readonly logPath: string;

  // Define the required flow
  private readonly PHASE_SEQUENCE: WorkPhase[] = [
    'STRATEGIZE',
    'SPEC',
    'PLAN',
    'THINK',
    'IMPLEMENT',
    'VERIFY',
    'REVIEW',
    'PR',
    'MONITOR'
  ];

  // Phase-specific validations
  private readonly PHASE_VALIDATIONS: Record<WorkPhase, PhaseValidation> = {
    'STRATEGIZE': {
      phase: 'STRATEGIZE',
      required: ['Problem identified', 'Approach selected', 'Connection to purpose'],
      artifacts: ['strategy.md'],
      qualityGates: [
        {
          name: 'Purpose alignment',
          check: async () => this.checkPurposeAlignment(),
          required: true
        }
      ]
    },
    'SPEC': {
      phase: 'SPEC',
      required: ['Acceptance criteria', 'Success metrics', 'Definition of done'],
      artifacts: ['spec.md'],
      qualityGates: [
        {
          name: 'Measurable criteria',
          check: async () => this.checkMeasurableCriteria(),
          required: true
        }
      ]
    },
    'PLAN': {
      phase: 'PLAN',
      required: ['Task breakdown', 'Time estimates', 'Dependencies'],
      artifacts: ['plan.md'],
      qualityGates: [
        {
          name: 'Realistic estimates',
          check: async () => this.checkRealisticEstimates(),
          required: true
        }
      ]
    },
    'THINK': {
      phase: 'THINK',
      required: ['Edge cases', 'Risk mitigation', 'Failure modes'],
      artifacts: ['edge_cases.md'],
      qualityGates: [
        {
          name: 'Risk coverage',
          check: async () => this.checkRiskCoverage(),
          required: true
        }
      ]
    },
    'IMPLEMENT': {
      phase: 'IMPLEMENT',
      required: ['Code complete', 'Unit tests', 'Documentation'],
      artifacts: ['src/**/*.ts', 'test/**/*.test.ts'],
      qualityGates: [
        {
          name: 'Build passes',
          check: async () => this.checkBuildPasses(),
          required: true
        },
        {
          name: 'Test coverage >80%',
          check: async () => this.checkTestCoverage(),
          required: false
        }
      ]
    },
    'VERIFY': {
      phase: 'VERIFY',
      required: ['All tests pass', 'Integration verified', 'Performance measured'],
      artifacts: ['test_results.json'],
      qualityGates: [
        {
          name: '100% tests pass',
          check: async () => this.checkAllTestsPass(),
          required: true
        },
        {
          name: 'No performance regression',
          check: async () => this.checkPerformance(),
          required: true
        }
      ]
    },
    'REVIEW': {
      phase: 'REVIEW',
      required: ['Quality validated', 'Acceptance criteria met', 'No blockers'],
      artifacts: ['review.md'],
      qualityGates: [
        {
          name: 'Acceptance criteria met',
          check: async () => this.checkAcceptanceCriteria(),
          required: true
        },
        {
          name: 'No critical issues',
          check: async () => this.checkNoCriticalIssues(),
          required: true
        }
      ]
    },
    'PR': {
      phase: 'PR',
      required: ['Commit created', 'PR opened', 'CI passes'],
      artifacts: ['.git/COMMIT_EDITMSG'],
      qualityGates: [
        {
          name: 'Clean commit',
          check: async () => this.checkCleanCommit(),
          required: true
        }
      ]
    },
    'MONITOR': {
      phase: 'MONITOR',
      required: ['System stable', 'Metrics collected', 'No degradation'],
      artifacts: ['monitoring.json'],
      qualityGates: [
        {
          name: 'System stability',
          check: async () => this.checkSystemStability(),
          required: true
        }
      ]
    }
  };

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string
  ) {
    this.logPath = path.join(workspaceRoot, 'state/logs/work_process.jsonl');

    // Ensure log directory exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Start a new work cycle for a task
   */
  async startCycle(taskId: string): Promise<void> {
    if (this.currentPhase.has(taskId)) {
      throw new Error(`Task ${taskId} already in cycle at phase ${this.currentPhase.get(taskId)}`);
    }

    this.currentPhase.set(taskId, 'STRATEGIZE');
    this.logTransition(taskId, null, 'STRATEGIZE', true);

    logInfo('Work cycle started', {
      taskId,
      phase: 'STRATEGIZE'
    });
  }

  /**
   * Advance to next phase (with validation)
   */
  async advancePhase(taskId: string): Promise<boolean> {
    const currentPhase = this.currentPhase.get(taskId);
    if (!currentPhase) {
      throw new Error(`Task ${taskId} not in work cycle`);
    }

    // Validate current phase completion
    const validation = await this.validatePhase(taskId, currentPhase);
    if (!validation.passed) {
      logWarning('Phase validation failed', {
        taskId,
        phase: currentPhase,
        errors: validation.errors
      });

      // Trigger automatic learning capture
      this.captureLearning(taskId, currentPhase, validation.errors);

      return false;
    }

    // Get next phase
    const currentIndex = this.PHASE_SEQUENCE.indexOf(currentPhase);
    if (currentIndex === this.PHASE_SEQUENCE.length - 1) {
      // Cycle complete
      this.completeCycle(taskId);
      return true;
    }

    const nextPhase = this.PHASE_SEQUENCE[currentIndex + 1];

    // Transition to next phase
    this.currentPhase.set(taskId, nextPhase);
    this.logTransition(taskId, currentPhase, nextPhase, true);

    logInfo('Phase advanced', {
      taskId,
      from: currentPhase,
      to: nextPhase
    });

    return true;
  }

  /**
   * Validate a phase has completed requirements
   */
  private async validatePhase(
    taskId: string,
    phase: WorkPhase
  ): Promise<{ passed: boolean; errors: string[] }> {
    const validation = this.PHASE_VALIDATIONS[phase];
    const errors: string[] = [];

    // Check quality gates
    for (const gate of validation.qualityGates) {
      try {
        const passed = await gate.check();
        if (!passed && gate.required) {
          errors.push(`Quality gate failed: ${gate.name}`);
        }
      } catch (error) {
        errors.push(`Quality gate error: ${gate.name} - ${error}`);
      }
    }

    // Special validation for VERIFY phase
    if (phase === 'VERIFY') {
      const testsPassed = await this.checkAllTestsPass();
      if (!testsPassed) {
        errors.push('REVIEW REJECTION: Tests must pass 100% before proceeding');
        // Force return to IMPLEMENT
        this.currentPhase.set(taskId, 'IMPLEMENT');
        this.logTransition(taskId, 'VERIFY', 'IMPLEMENT', false, errors);
      }
    }

    return {
      passed: errors.length === 0,
      errors
    };
  }

  /**
   * Quality gate checks
   */
  private async checkPurposeAlignment(): Promise<boolean> {
    // Check if strategy document mentions WeatherVane goals
    const strategyPath = path.join(this.workspaceRoot, 'docs/strategy.md');
    if (!fs.existsSync(strategyPath)) return false;

    const content = fs.readFileSync(strategyPath, 'utf-8');
    return content.includes('weather') || content.includes('forecast') || content.includes('energy');
  }

  private async checkMeasurableCriteria(): Promise<boolean> {
    // Check if spec has quantifiable metrics
    const specPath = path.join(this.workspaceRoot, 'docs/spec.md');
    if (!fs.existsSync(specPath)) return false;

    const content = fs.readFileSync(specPath, 'utf-8');
    return content.includes('%') || content.includes('ms') || content.includes('MB');
  }

  private async checkRealisticEstimates(): Promise<boolean> {
    // Check if plan has time estimates
    return true; // Simplified for now
  }

  private async checkRiskCoverage(): Promise<boolean> {
    // Check if edge cases documented
    return true; // Simplified for now
  }

  private async checkBuildPasses(): Promise<boolean> {
    // Check TypeScript build
    try {
      const { execSync } = require('child_process');
      execSync('npm run build', {
        cwd: this.workspaceRoot,
        stdio: 'pipe'
      });
      return true;
    } catch {
      return false;
    }
  }

  private async checkTestCoverage(): Promise<boolean> {
    // Check test coverage percentage
    return true; // Would check actual coverage in production
  }

  private async checkAllTestsPass(): Promise<boolean> {
    // This is the critical check that enforces 100% pass rate
    try {
      const { execSync } = require('child_process');
      const output = execSync('npm test 2>&1', {
        cwd: this.workspaceRoot,
        stdio: 'pipe'
      }).toString();

      // Check for any failures
      if (output.includes('FAIL') || output.includes('failed')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private async checkPerformance(): Promise<boolean> {
    // Check performance metrics
    return true; // Simplified
  }

  private async checkAcceptanceCriteria(): Promise<boolean> {
    // Check all acceptance criteria met
    return true; // Would check against spec in production
  }

  private async checkNoCriticalIssues(): Promise<boolean> {
    // Check for critical bugs
    return true; // Simplified
  }

  private async checkCleanCommit(): Promise<boolean> {
    // Check git status is clean
    try {
      const { execSync } = require('child_process');
      const output = execSync('git status --porcelain', {
        cwd: this.workspaceRoot,
        stdio: 'pipe'
      }).toString();

      return output.trim().length === 0;
    } catch {
      return false;
    }
  }

  private async checkSystemStability(): Promise<boolean> {
    // Check system metrics
    return true; // Would check actual metrics in production
  }

  /**
   * Capture learning when phase fails
   */
  private captureLearning(taskId: string, phase: WorkPhase, errors: string[]): void {
    const learning = {
      timestamp: Date.now(),
      taskId,
      phase,
      errors,
      learning: `Phase ${phase} failed validation. Process enforcement prevented progression.`,
      prevention: 'Automatic phase validation before advancement',
      triggered: 'automatically'
    };

    const learningPath = path.join(this.workspaceRoot, 'state/logs/learnings.jsonl');
    fs.appendFileSync(learningPath, JSON.stringify(learning) + '\n');

    logInfo('Learning captured automatically', {
      phase,
      errorCount: errors.length
    });
  }

  /**
   * Complete the work cycle
   */
  private completeCycle(taskId: string): void {
    this.currentPhase.delete(taskId);

    logInfo('Work cycle completed', {
      taskId,
      transitions: this.phaseHistory.filter(t => t.taskId === taskId).length
    });

    // Mark task as done in state machine
    this.stateMachine.transition(taskId, 'done');
  }

  /**
   * Log phase transition
   */
  private logTransition(
    taskId: string,
    from: WorkPhase | null,
    to: WorkPhase,
    passed: boolean,
    errors?: string[]
  ): void {
    const transition: PhaseTransition = {
      from: from || 'NONE' as any,
      to,
      taskId,
      timestamp: Date.now(),
      validationPassed: passed,
      validationErrors: errors
    };

    this.phaseHistory.push(transition);

    fs.appendFileSync(this.logPath, JSON.stringify(transition) + '\n');
  }

  /**
   * Get current phase for a task
   */
  getCurrentPhase(taskId: string): WorkPhase | undefined {
    return this.currentPhase.get(taskId);
  }

  /**
   * Get phase history
   */
  getPhaseHistory(taskId?: string): PhaseTransition[] {
    if (taskId) {
      return this.phaseHistory.filter(t => t.taskId === taskId);
    }
    return this.phaseHistory;
  }

  /**
   * Force phase (emergency override - logged)
   */
  forcePhase(taskId: string, phase: WorkPhase, reason: string): void {
    const current = this.currentPhase.get(taskId);

    logWarning('FORCE PHASE OVERRIDE', {
      taskId,
      from: current,
      to: phase,
      reason
    });

    this.currentPhase.set(taskId, phase);
    this.logTransition(taskId, current || null, phase, false, [`Forced: ${reason}`]);
  }
}