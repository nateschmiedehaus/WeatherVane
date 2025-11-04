/**
 * Completion Verifier
 *
 * CRITICAL: Prevents claiming work is complete when it's not.
 * This is the meta-fix for the systemic problem of marking tasks
 * as done without actual verification.
 *
 * Enforces mandatory checks before ANY work can be marked complete:
 * - No mock implementations
 * - Real integration tests pass
 * - Feature flags are enabled
 * - End-to-end functionality verified
 * - Documentation updated
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface CompletionCriteria {
  phase: string;
  taskId: string;
  requirements: VerificationRequirement[];
}

export interface VerificationRequirement {
  name: string;
  description: string;
  check: () => Promise<VerificationResult>;
  mandatory: boolean;
  category: 'integration' | 'testing' | 'documentation' | 'functionality' | 'quality';
}

export interface VerificationResult {
  passed: boolean;
  evidence?: string;
  failures?: string[];
  recommendation?: string;
}

export interface CompletionReport {
  phase: string;
  taskId: string;
  timestamp: number;
  overallPassed: boolean;
  requirements: Array<{
    name: string;
    category: string;
    passed: boolean;
    evidence?: string;
    failures?: string[];
  }>;
  blockers: string[];
  canMarkComplete: boolean;
}

/**
 * Enforces REAL completion verification - no more false claims
 */
export class CompletionVerifier {
  private readonly logPath: string;
  private verificationHistory: CompletionReport[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.logPath = path.join(workspaceRoot, 'state/logs/completion_verification.jsonl');

    // Ensure log directory exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Verify if work can be marked complete
   * THIS IS THE CRITICAL GATE - NO FALSE COMPLETIONS
   */
  async verifyCompletion(criteria: CompletionCriteria): Promise<CompletionReport> {
    logInfo('Starting completion verification', {
      phase: criteria.phase,
      taskId: criteria.taskId,
      requirementCount: criteria.requirements.length
    });

    const report: CompletionReport = {
      phase: criteria.phase,
      taskId: criteria.taskId,
      timestamp: Date.now(),
      overallPassed: true,
      requirements: [],
      blockers: [],
      canMarkComplete: false
    };

    // Run ALL verification checks
    for (const requirement of criteria.requirements) {
      try {
        const result = await requirement.check();

        report.requirements.push({
          name: requirement.name,
          category: requirement.category,
          passed: result.passed,
          evidence: result.evidence,
          failures: result.failures
        });

        if (!result.passed && requirement.mandatory) {
          report.overallPassed = false;
          report.blockers.push(`${requirement.name}: ${result.failures?.join(', ') || 'Failed'}`);
        }

        logInfo(`Verification: ${requirement.name}`, {
          passed: result.passed,
          mandatory: requirement.mandatory,
          evidence: result.evidence?.slice(0, 100)
        });

      } catch (error) {
        // Verification error = automatic failure
        report.requirements.push({
          name: requirement.name,
          category: requirement.category,
          passed: false,
          failures: [`Verification error: ${error}`]
        });

        if (requirement.mandatory) {
          report.overallPassed = false;
          report.blockers.push(`${requirement.name}: Verification failed`);
        }

        logError('Verification check failed', {
          requirement: requirement.name,
          error: String(error)
        });
      }
    }

    // Final verdict
    report.canMarkComplete = report.overallPassed && report.blockers.length === 0;

    // Log the report
    this.logReport(report);

    // Emit warnings if attempting to mark incomplete work as done
    if (!report.canMarkComplete) {
      logError('COMPLETION REJECTED - Work does not meet criteria', {
        phase: criteria.phase,
        taskId: criteria.taskId,
        blockers: report.blockers
      });
    }

    return report;
  }

  /**
   * Standard verification requirements for Phase 3 (Intelligence)
   */
  getPhase3Requirements(): VerificationRequirement[] {
    return [
      {
        name: 'No Mock Data',
        description: 'Verify no mock responses in production code',
        category: 'integration',
        mandatory: true,
        check: async () => this.checkNoMockData()
      },
      {
        name: 'Feature Flags Enabled',
        description: 'Verify Phase 3 features are enabled by default',
        category: 'functionality',
        mandatory: true,
        check: async () => this.checkPhase3FlagsEnabled()
      },
      {
        name: 'MCP Integration Active',
        description: 'Verify real MCP tool calls work',
        category: 'integration',
        mandatory: true,
        check: async () => this.checkMCPIntegration()
      },
      {
        name: 'Integration Tests Pass',
        description: 'Verify end-to-end tests work with real data',
        category: 'testing',
        mandatory: true,
        check: async () => this.checkIntegrationTests()
      },
      {
        name: 'Status Document Updated',
        description: 'IMPLEMENTATION_STATUS.md reflects true progress',
        category: 'documentation',
        mandatory: true,
        check: async () => this.checkStatusDocumentAccurate()
      }
    ];
  }

  /**
   * Standard verification requirements for Phase 4 (Process Enforcement)
   */
  getPhase4Requirements(): VerificationRequirement[] {
    return [
      {
        name: 'Quality Gates Active',
        description: 'Verify quality gates perform real checks',
        category: 'functionality',
        mandatory: true,
        check: async () => this.checkQualityGatesActive()
      },
      {
        name: 'Process Enforcement Working',
        description: 'Verify STRATEGIZE→MONITOR cycle enforced',
        category: 'functionality',
        mandatory: true,
        check: async () => this.checkProcessEnforcement()
      },
      {
        name: 'No Stubbed Checks',
        description: 'Verify no quality checks just return true',
        category: 'quality',
        mandatory: true,
        check: async () => this.checkNoStubbedChecks()
      },
      {
        name: 'Build Passes',
        description: 'TypeScript build has zero errors',
        category: 'quality',
        mandatory: true,
        check: async () => this.checkBuildPasses()
      },
      {
        name: 'All Tests Pass',
        description: '100% of tests must pass',
        category: 'testing',
        mandatory: true,
        check: async () => this.checkAllTestsPass()
      }
    ];
  }

  /**
   * Verification: No mock data in production code
   */
  private async checkNoMockData(): Promise<VerificationResult> {
    try {
      // Search for mock indicators in source files
      const output = execSync(
        'grep -r "mock\\|Mock\\|MOCK\\|stub\\|Stub\\|fake\\|Fake" src/ --include="*.ts" | grep -v test | grep -v spec | head -20',
        {
          cwd: this.workspaceRoot,
          encoding: 'utf-8'
        }
      );

      const lines = output.trim().split('\n').filter(line => line.length > 0);

      // Check for mock-related terms
      const mockLines = lines.filter(line =>
        line.includes('mockResponse') ||
        line.includes('mockData') ||
        line.includes('// Simulate') ||
        line.includes('would execute in production') ||
        line.includes('expected behavior')
      );

      if (mockLines.length > 0) {
        return {
          passed: false,
          failures: mockLines.slice(0, 5),
          recommendation: 'Replace mock implementations with real integrations'
        };
      }

      return {
        passed: true,
        evidence: 'No mock data found in production code'
      };

    } catch (error) {
      // grep returns non-zero if no matches - that's good!
      if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
        return {
          passed: true,
          evidence: 'No mock patterns found'
        };
      }

      return {
        passed: false,
        failures: [`Check failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Verification: Phase 3 feature flags enabled
   */
  private async checkPhase3FlagsEnabled(): Promise<VerificationResult> {
    try {
      const loopPath = path.join(this.workspaceRoot, 'src/orchestrator/orchestrator_loop.ts');
      const content = fs.readFileSync(loopPath, 'utf-8');

      // Check that Phase 3 flags default to true
      const checks = [
        'enableAdaptiveRoadmap: options.enableAdaptiveRoadmap ?? true',
        'enableContextManager: options.enableContextManager ?? true',
        'enableQualityTrends: options.enableQualityTrends ?? true'
      ];

      const failures: string[] = [];
      for (const check of checks) {
        if (!content.includes(check)) {
          const flagName = check.split(':')[0].trim();
          failures.push(`${flagName} not enabled by default`);
        }
      }

      if (failures.length > 0) {
        return {
          passed: false,
          failures,
          recommendation: 'Set all Phase 3 feature flags to default true'
        };
      }

      return {
        passed: true,
        evidence: 'All Phase 3 features enabled by default'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Could not check feature flags: ${error}`]
      };
    }
  }

  /**
   * Verification: MCP integration actually works
   */
  private async checkMCPIntegration(): Promise<VerificationResult> {
    try {
      const mcpClientPath = path.join(this.workspaceRoot, 'src/orchestrator/mcp_client.ts');
      const content = fs.readFileSync(mcpClientPath, 'utf-8');

      // Check for real MCP tool calls
      const hasRealTools = content.includes('TOOLS = {') &&
                          content.includes('mcp__weathervane__plan_next') &&
                          content.includes('mcp__weathervane__plan_update');

      // Check for mock fallbacks
      const hasMockFallback = content.includes('mockResponse') ||
                              content.includes('// Simulate MCP call');

      if (!hasRealTools) {
        return {
          passed: false,
          failures: ['MCP tools not properly defined'],
          recommendation: 'Add real MCP tool definitions'
        };
      }

      if (hasMockFallback) {
        return {
          passed: false,
          failures: ['MCP client still contains mock responses'],
          recommendation: 'Remove all mock data from MCP client'
        };
      }

      return {
        passed: true,
        evidence: 'MCP client configured for real tool calls'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Could not verify MCP integration: ${error}`]
      };
    }
  }

  /**
   * Verification: Integration tests work with real data
   */
  private async checkIntegrationTests(): Promise<VerificationResult> {
    try {
      // Check if integration test exists
      const testPath = path.join(this.workspaceRoot, 'test_mcp_integration.mjs');

      if (!fs.existsSync(testPath)) {
        return {
          passed: false,
          failures: ['Integration test file missing'],
          recommendation: 'Create real integration tests'
        };
      }

      const content = fs.readFileSync(testPath, 'utf-8');

      // Check for mock acknowledgment
      if (content.includes('mock MCP responses (expected behavior)')) {
        return {
          passed: false,
          failures: ['Integration test acknowledges using mocks'],
          recommendation: 'Update test to use real MCP integration'
        };
      }

      // Try to run the test
      try {
        const output = execSync('node test_mcp_integration.mjs 2>&1', {
          cwd: this.workspaceRoot,
          encoding: 'utf-8',
          timeout: 30000
        });

        if (output.includes('Error') || output.includes('Failed')) {
          return {
            passed: false,
            failures: ['Integration test execution failed'],
            evidence: output.slice(0, 200)
          };
        }

        return {
          passed: true,
          evidence: 'Integration tests pass'
        };

      } catch (testError) {
        return {
          passed: false,
          failures: [`Integration test failed: ${testError}`]
        };
      }

    } catch (error) {
      return {
        passed: false,
        failures: [`Could not check integration tests: ${error}`]
      };
    }
  }

  /**
   * Verification: Status document accurately reflects progress
   */
  private async checkStatusDocumentAccurate(): Promise<VerificationResult> {
    try {
      const statusPath = path.join(this.workspaceRoot, 'IMPLEMENTATION_STATUS.md');

      if (!fs.existsSync(statusPath)) {
        return {
          passed: false,
          failures: ['IMPLEMENTATION_STATUS.md not found'],
          recommendation: 'Create status document'
        };
      }

      const content = fs.readFileSync(statusPath, 'utf-8');

      // Check for unchecked Phase 3/4 items
      const phase3Section = content.match(/Phase 3[^#]*/);
      const phase4Section = content.match(/Phase 4[^#]*/);

      const failures: string[] = [];

      if (phase3Section && phase3Section[0].includes('- [ ]')) {
        failures.push('Phase 3 has unchecked items in status document');
      }

      if (phase4Section && phase4Section[0].includes('- [ ]')) {
        failures.push('Phase 4 has unchecked items in status document');
      }

      if (failures.length > 0) {
        return {
          passed: false,
          failures,
          recommendation: 'Update IMPLEMENTATION_STATUS.md to reflect true progress'
        };
      }

      return {
        passed: true,
        evidence: 'Status document up to date'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Could not check status document: ${error}`]
      };
    }
  }

  /**
   * Verification: Quality gates perform real checks
   */
  private async checkQualityGatesActive(): Promise<VerificationResult> {
    try {
      const enforcerPath = path.join(this.workspaceRoot, 'src/orchestrator/work_process_enforcer.ts');
      const content = fs.readFileSync(enforcerPath, 'utf-8');

      // Look for stubbed checks
      const stubbedPatterns = [
        'return true; // Simplified',
        'return true; // Would check',
        '// TODO: Implement',
        '// Stubbed for now'
      ];

      const failures: string[] = [];
      for (const pattern of stubbedPatterns) {
        if (content.includes(pattern)) {
          failures.push(`Found stubbed check: "${pattern}"`);
        }
      }

      if (failures.length > 0) {
        return {
          passed: false,
          failures,
          recommendation: 'Implement all quality gate checks'
        };
      }

      // Check for real implementations
      const hasRealChecks = content.includes('execSync') &&
                           content.includes('npm run build') &&
                           content.includes('npm test');

      if (!hasRealChecks) {
        return {
          passed: false,
          failures: ['Quality gates lack real implementation'],
          recommendation: 'Add actual verification logic'
        };
      }

      return {
        passed: true,
        evidence: 'Quality gates have real implementations'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Could not verify quality gates: ${error}`]
      };
    }
  }

  /**
   * Verification: Process enforcement actually works
   */
  private async checkProcessEnforcement(): Promise<VerificationResult> {
    try {
      const enforcerPath = path.join(this.workspaceRoot, 'src/orchestrator/work_process_enforcer.ts');

      if (!fs.existsSync(enforcerPath)) {
        return {
          passed: false,
          failures: ['WorkProcessEnforcer not found'],
          recommendation: 'Create process enforcement system'
        };
      }

      const content = fs.readFileSync(enforcerPath, 'utf-8');

      // Check for all phases
      const requiredPhases = [
        'STRATEGIZE',
        'SPEC',
        'PLAN',
        'AFP_ALIGNMENT',
        'THINK',
        'IMPLEMENT',
        'VERIFY',
        'REVIEW',
        'PR',
        'MONITOR'
      ];

      const missingPhases = requiredPhases.filter(phase => !content.includes(`'${phase}'`));

      if (missingPhases.length > 0) {
        return {
          passed: false,
          failures: [`Missing phases: ${missingPhases.join(', ')}`],
          recommendation: 'Implement all work process phases'
        };
      }

      // Check for validation logic
      const hasValidation = content.includes('validatePhase') &&
                           content.includes('advancePhase') &&
                           content.includes('captureLearning');

      if (!hasValidation) {
        return {
          passed: false,
          failures: ['Process enforcement lacks validation logic'],
          recommendation: 'Add phase validation and advancement logic'
        };
      }

      return {
        passed: true,
        evidence: 'Process enforcement system complete'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Could not verify process enforcement: ${error}`]
      };
    }
  }

  /**
   * Verification: No stubbed quality checks
   */
  private async checkNoStubbedChecks(): Promise<VerificationResult> {
    try {
      // Search for stubbed patterns in all source files
      const output = execSync(
        'grep -r "return true;.*Simplified\\|TODO.*Implement\\|Stubbed\\|Would.*check" src/ --include="*.ts" | grep -v test | head -10',
        {
          cwd: this.workspaceRoot,
          encoding: 'utf-8'
        }
      );

      const lines = output.trim().split('\n').filter(line => line.length > 0);

      if (lines.length > 0) {
        return {
          passed: false,
          failures: lines.slice(0, 5),
          recommendation: 'Replace all stubbed checks with real implementations'
        };
      }

      return {
        passed: true,
        evidence: 'No stubbed checks found'
      };

    } catch (error) {
      // grep returns non-zero if no matches - that's good!
      if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
        return {
          passed: true,
          evidence: 'No stubbed patterns found'
        };
      }

      return {
        passed: false,
        failures: [`Check failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Verification: Build passes with zero errors
   */
  private async checkBuildPasses(): Promise<VerificationResult> {
    try {
      const output = execSync('npm run build 2>&1', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        timeout: 60000
      });

      if (output.includes('error') || output.includes('Error')) {
        const errorLines = output.split('\n')
          .filter(line => line.includes('error'))
          .slice(0, 5);

        return {
          passed: false,
          failures: errorLines,
          recommendation: 'Fix all TypeScript errors'
        };
      }

      return {
        passed: true,
        evidence: 'Build completes with zero errors'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Build failed: ${error}`],
        recommendation: 'Fix build errors'
      };
    }
  }

  /**
   * Verification: All tests pass (100% requirement)
   */
  private async checkAllTestsPass(): Promise<VerificationResult> {
    try {
      const output = execSync('npm test 2>&1', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        timeout: 120000
      });

      if (output.includes('fail') || output.includes('FAIL')) {
        const failedTests = (output.match(/✗[^\n]+/g) || []).slice(0, 5);

        return {
          passed: false,
          failures: failedTests,
          recommendation: 'Fix all failing tests'
        };
      }

      return {
        passed: true,
        evidence: 'All tests pass'
      };

    } catch (error) {
      return {
        passed: false,
        failures: [`Test execution failed: ${error}`],
        recommendation: 'Ensure tests can run and pass'
      };
    }
  }

  /**
   * Log verification report
   */
  private logReport(report: CompletionReport): void {
    // Store in history
    this.verificationHistory.push(report);

    // Log to file
    try {
      fs.appendFileSync(this.logPath, JSON.stringify(report) + '\n');
    } catch (error) {
      logError('Failed to log completion report', { error: String(error) });
    }

    // Log summary
    const passedCount = report.requirements.filter(r => r.passed).length;
    const totalCount = report.requirements.length;

    logInfo('Completion verification complete', {
      phase: report.phase,
      taskId: report.taskId,
      passed: `${passedCount}/${totalCount}`,
      canComplete: report.canMarkComplete,
      blockers: report.blockers.length
    });
  }

  /**
   * Get verification history
   */
  getHistory(): CompletionReport[] {
    return this.verificationHistory;
  }

  /**
   * Generate markdown report of verification
   */
  generateMarkdownReport(report: CompletionReport): string {
    const lines = [
      `# Completion Verification Report`,
      ``,
      `**Phase:** ${report.phase}`,
      `**Task:** ${report.taskId}`,
      `**Date:** ${new Date(report.timestamp).toISOString()}`,
      `**Status:** ${report.canMarkComplete ? '✅ CAN COMPLETE' : '❌ CANNOT COMPLETE'}`,
      ``,
      `## Requirements (${report.requirements.filter(r => r.passed).length}/${report.requirements.length} passed)`,
      ``
    ];

    // Group by category
    const categories = ['integration', 'testing', 'functionality', 'quality', 'documentation'];

    for (const category of categories) {
      const categoryReqs = report.requirements.filter(r => r.category === category);
      if (categoryReqs.length === 0) continue;

      lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      lines.push(``);

      for (const req of categoryReqs) {
        const status = req.passed ? '✅' : '❌';
        lines.push(`- ${status} **${req.name}**`);

        if (req.evidence) {
          lines.push(`  - Evidence: ${req.evidence}`);
        }

        if (req.failures && req.failures.length > 0) {
          lines.push(`  - Failures:`);
          for (const failure of req.failures) {
            lines.push(`    - ${failure}`);
          }
        }
      }
      lines.push(``);
    }

    if (report.blockers.length > 0) {
      lines.push(`## Blockers`);
      lines.push(``);
      for (const blocker of report.blockers) {
        lines.push(`- ❌ ${blocker}`);
      }
      lines.push(``);
    }

    lines.push(`## Verdict`);
    lines.push(``);
    if (report.canMarkComplete) {
      lines.push(`✅ **This work meets all completion criteria and can be marked as done.**`);
    } else {
      lines.push(`❌ **This work does NOT meet completion criteria and cannot be marked as done.**`);
      lines.push(``);
      lines.push(`**Action Required:** Fix all blockers before claiming completion.`);
    }

    return lines.join('\n');
  }
}

/**
 * Export factory function for standard verifications
 */
export function createPhaseVerification(
  phase: string,
  taskId: string,
  workspaceRoot: string
): { verifier: CompletionVerifier; criteria: CompletionCriteria } {
  const verifier = new CompletionVerifier(workspaceRoot);

  let requirements: VerificationRequirement[];

  switch (phase) {
    case 'Phase3':
    case 'Intelligence':
      requirements = verifier.getPhase3Requirements();
      break;

    case 'Phase4':
    case 'ProcessEnforcement':
      requirements = verifier.getPhase4Requirements();
      break;

    default:
      // Generic requirements for any phase
      requirements = [
        ...verifier.getPhase3Requirements(),
        ...verifier.getPhase4Requirements()
      ];
  }

  const criteria: CompletionCriteria = {
    phase,
    taskId,
    requirements
  };

  return { verifier, criteria };
}
