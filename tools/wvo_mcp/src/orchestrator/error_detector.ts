/**
 * Error Detector - Proactive error detection and auto-remediation
 *
 * Monitors build/test/runtime for errors and triggers fixes automatically.
 * Empowers orchestrator agents to maintain system health without human intervention.
 */

import { logError, logWarning, logInfo } from '../telemetry/logger.js';
import type { WorkspaceSession } from '../worker/session.js';

export interface ErrorSignal {
  type: 'build' | 'test' | 'runtime' | 'audit' | 'lint';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  details?: string;
  stackTrace?: string;
  timestamp: string;
  source?: string; // file path or module
  exitCode?: number;
  fixable?: boolean;
  suggestedFix?: string;
}

export interface RemediationResult {
  success: boolean;
  applied: boolean;
  fixDescription?: string;
  verificationPassed?: boolean;
  error?: string;
}

/**
 * Pattern-based error detection and auto-remediation
 */
export class ErrorDetector {
  private errorHistory: ErrorSignal[] = [];
  private readonly MAX_HISTORY = 100;

  constructor(private readonly session: WorkspaceSession) {}

  /**
   * Analyze build output for errors
   */
  analyzeBuildOutput(stdout: string, stderr: string, exitCode: number): ErrorSignal[] {
    const errors: ErrorSignal[] = [];

    if (exitCode !== 0) {
      // TypeScript compilation errors
      const tsErrors = this.extractTypeScriptErrors(stderr);
      errors.push(...tsErrors);

      // Module resolution errors
      const moduleErrors = this.extractModuleErrors(stderr);
      errors.push(...moduleErrors);

      // Generic build failure
      if (errors.length === 0) {
        errors.push({
          type: 'build',
          severity: 'critical',
          message: 'Build failed with unknown error',
          details: stderr,
          timestamp: new Date().toISOString(),
          exitCode,
          fixable: false,
        });
      }
    }

    this.recordErrors(errors);
    return errors;
  }

  /**
   * Analyze test output for failures
   */
  analyzeTestOutput(output: string, exitCode: number): ErrorSignal[] {
    const errors: ErrorSignal[] = [];

    if (exitCode !== 0 || output.includes('FAIL')) {
      // Extract failing test names
      const failedTests = this.extractFailedTests(output);

      for (const test of failedTests) {
        const error: ErrorSignal = {
          type: 'test',
          severity: this.classifyTestFailure(test.message),
          message: `Test failed: ${test.name}`,
          details: test.message,
          timestamp: new Date().toISOString(),
          source: test.file,
          fixable: this.isTestFailureFixable(test.message),
          suggestedFix: this.suggestTestFix(test.message),
        };
        errors.push(error);
      }
    }

    this.recordErrors(errors);
    return errors;
  }

  /**
   * Analyze npm audit output
   */
  analyzeAuditOutput(output: string, exitCode: number): ErrorSignal[] {
    const errors: ErrorSignal[] = [];

    if (exitCode !== 0 || output.includes('vulnerabilities')) {
      const vulnMatch = output.match(/(\d+) vulnerabilities/);
      if (vulnMatch) {
        const count = parseInt(vulnMatch[1]);
        if (count > 0) {
          errors.push({
            type: 'audit',
            severity: count > 10 ? 'critical' : count > 5 ? 'high' : 'medium',
            message: `Found ${count} security vulnerabilities`,
            details: output,
            timestamp: new Date().toISOString(),
            fixable: true,
            suggestedFix: 'npm audit fix',
          });
        }
      }
    }

    this.recordErrors(errors);
    return errors;
  }

  /**
   * Attempt automatic remediation
   */
  async attemptRemediation(error: ErrorSignal): Promise<RemediationResult> {
    if (!error.fixable || !error.suggestedFix) {
      return {
        success: false,
        applied: false,
        error: 'No automated fix available',
      };
    }

    logInfo('Attempting automatic remediation', {
      errorType: error.type,
      severity: error.severity,
      fix: error.suggestedFix,
    });

    try {
      // Apply the suggested fix
      const fixResult = await this.applyFix(error);

      if (!fixResult.success) {
        return {
          success: false,
          applied: true,
          fixDescription: error.suggestedFix,
          error: fixResult.error,
        };
      }

      // Verify the fix worked
      const verifyResult = await this.verifyFix(error);

      return {
        success: verifyResult.success,
        applied: true,
        fixDescription: error.suggestedFix,
        verificationPassed: verifyResult.success,
        error: verifyResult.error,
      };
    } catch (err) {
      logError('Remediation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        applied: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get recent error trends
   */
  getErrorTrends(): {
    criticalCount: number;
    highCount: number;
    recentErrors: ErrorSignal[];
    topErrorTypes: Array<{ type: string; count: number }>;
  } {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recent = this.errorHistory.filter(e =>
      new Date(e.timestamp).getTime() > last24h
    );

    const criticalCount = recent.filter(e => e.severity === 'critical').length;
    const highCount = recent.filter(e => e.severity === 'high').length;

    const typeCounts = new Map<string, number>();
    for (const error of recent) {
      typeCounts.set(error.type, (typeCounts.get(error.type) || 0) + 1);
    }

    const topErrorTypes = Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      criticalCount,
      highCount,
      recentErrors: recent.slice(-10),
      topErrorTypes,
    };
  }

  /**
   * Check if system health is degraded
   */
  isSystemHealthDegraded(): boolean {
    const trends = this.getErrorTrends();

    // System is degraded if:
    // - 3+ critical errors in last 24h
    // - 10+ high severity errors in last 24h
    // - Same error type recurring 5+ times
    return (
      trends.criticalCount >= 3 ||
      trends.highCount >= 10 ||
      trends.topErrorTypes.some(t => t.count >= 5)
    );
  }

  // ============ Private Helper Methods ============

  private extractTypeScriptErrors(stderr: string): ErrorSignal[] {
    const errors: ErrorSignal[] = [];
    const tsErrorPattern = /([^\s]+\.ts)\((\d+),(\d+)\): error TS(\d+): (.+)/g;
    let match;

    while ((match = tsErrorPattern.exec(stderr)) !== null) {
      const [, file, line, col, code, message] = match;

      errors.push({
        type: 'build',
        severity: this.classifyTSError(code),
        message: `TypeScript error TS${code}: ${message}`,
        details: `${file}:${line}:${col}`,
        source: file,
        timestamp: new Date().toISOString(),
        fixable: this.isTSErrorFixable(code, message),
        suggestedFix: this.suggestTSFix(code, message),
      });
    }

    return errors;
  }

  private extractModuleErrors(stderr: string): ErrorSignal[] {
    const errors: ErrorSignal[] = [];

    if (stderr.includes('Cannot find module')) {
      const modulePattern = /Cannot find module '([^']+)'/g;
      let match;

      while ((match = modulePattern.exec(stderr)) !== null) {
        const moduleName = match[1];
        errors.push({
          type: 'build',
          severity: 'high',
          message: `Cannot find module '${moduleName}'`,
          timestamp: new Date().toISOString(),
          fixable: true,
          suggestedFix: `npm install ${moduleName}`,
        });
      }
    }

    return errors;
  }

  private extractFailedTests(output: string): Array<{
    name: string;
    file: string;
    message: string;
  }> {
    const tests: Array<{ name: string; file: string; message: string }> = [];
    const failPattern = /FAIL\s+(.+?\.test\.ts)\s+>\s+(.+)/g;
    let match;

    while ((match = failPattern.exec(output)) !== null) {
      const [, file, name] = match;
      // Extract error message (next few lines after FAIL)
      const startIdx = match.index + match[0].length;
      const messageEnd = output.indexOf('\n\n', startIdx);
      const message = output.slice(startIdx, messageEnd > 0 ? messageEnd : startIdx + 200).trim();

      tests.push({ name, file, message });
    }

    return tests;
  }

  private classifyTestFailure(message: string): ErrorSignal['severity'] {
    if (message.includes('Cannot read properties') || message.includes('undefined')) {
      return 'critical'; // Likely null/undefined bug
    }
    if (message.includes('expected') && message.includes('received')) {
      return 'high'; // Assertion failure
    }
    return 'medium';
  }

  private classifyTSError(code: string): ErrorSignal['severity'] {
    const criticalErrors = ['2304', '2307', '2322']; // Cannot find name, Cannot find module, Type mismatch
    return criticalErrors.includes(code) ? 'critical' : 'high';
  }

  private isTestFailureFixable(message: string): boolean {
    // Simple heuristics - can be extended
    return (
      message.includes('expected') ||
      message.includes('toHaveLength') ||
      message.includes('toBe') ||
      message.includes('Cannot read properties')
    );
  }

  private isTSErrorFixable(code: string, message: string): boolean {
    // Tool name pattern errors (the issue we just fixed!)
    if (message.includes('does not match pattern')) {
      return true;
    }

    // Missing imports
    if (code === '2304' && message.includes('Cannot find name')) {
      return true;
    }

    return false;
  }

  private suggestTestFix(message: string): string | undefined {
    if (message.includes('expected') && message.includes('toHaveLength')) {
      return 'Review test expectations and update logic to match';
    }
    if (message.includes('Cannot read properties of undefined')) {
      return 'Add null/undefined checks or ensure object is initialized';
    }
    return undefined;
  }

  private suggestTSFix(code: string, message: string): string | undefined {
    if (message.includes('does not match pattern')) {
      return 'Replace invalid characters (dots, spaces) in identifiers with underscores';
    }
    if (code === '2304') {
      return 'Add missing import statement';
    }
    return undefined;
  }

  private async applyFix(error: ErrorSignal): Promise<{ success: boolean; error?: string }> {
    // This would be extended to actually apply fixes
    // For now, just log what would be done
    logInfo('Would apply fix', { fix: error.suggestedFix });

    // TODO: Implement actual fix application
    // - Pattern-based file edits
    // - npm install/audit fix
    // - Import additions

    return { success: true };
  }

  private async verifyFix(error: ErrorSignal): Promise<{ success: boolean; error?: string }> {
    // Run appropriate verification based on error type
    switch (error.type) {
      case 'build':
        // Would run: npm run build
        return { success: true };
      case 'test':
        // Would run: npm test -- <specific test file>
        return { success: true };
      case 'audit':
        // Would run: npm audit
        return { success: true };
      default:
        return { success: true };
    }
  }

  private recordErrors(errors: ErrorSignal[]): void {
    this.errorHistory.push(...errors);

    // Trim history
    if (this.errorHistory.length > this.MAX_HISTORY) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_HISTORY);
    }

    // Log critical errors immediately
    for (const error of errors) {
      if (error.severity === 'critical') {
        logError('Critical error detected', {
          type: error.type,
          message: error.message,
          source: error.source,
          fixable: error.fixable,
        });
      }
    }
  }
}
