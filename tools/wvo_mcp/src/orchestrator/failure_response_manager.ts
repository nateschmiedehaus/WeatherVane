/**
 * Failure Response Manager - Intelligent validation of task failures
 *
 * Features:
 * - Validates failures (real vs spurious)
 * - Classifies error types
 * - Suggests automatic fixes
 * - Logs analysis for orchestrator action
 */

import type { StateMachine, Task } from './state_machine.js';
import { logInfo, logError, logWarning } from '../telemetry/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface FailureAnalysis {
  taskId: string;
  isValid: boolean;  // Is this a real failure or spurious?
  reason: string;
  errorClass: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  suggestedFix: string | null;
  shouldReassign: boolean;
  shouldEscalate: boolean;
}

interface ErrorClass {
  name: string;
  patterns: RegExp[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// Error Classification
// ============================================================================

const ERROR_CLASSES: ErrorClass[] = [
  {
    name: 'FILE_NOT_FOUND',
    patterns: [/ENOENT: no such file or directory/i, /cannot find file/i, /file.*not found/i],
    severity: 'high'
  },
  {
    name: 'PERMISSION_DENIED',
    patterns: [/EACCES/i, /permission denied/i, /access denied/i],
    severity: 'critical'
  },
  {
    name: 'BUILD_FAILURE',
    patterns: [/error TS\d+:/i, /npm ERR!/i, /compilation failed/i],
    severity: 'critical'
  },
  {
    name: 'MISSING_DEPENDENCY',
    patterns: [/cannot find module/i, /module not found/i, /ERR_MODULE_NOT_FOUND/i],
    severity: 'high'
  },
  {
    name: 'NETWORK_ERROR',
    patterns: [/ENOTFOUND/i, /ECONNREFUSED/i, /network error/i, /timeout/i],
    severity: 'medium'
  },
  {
    name: 'VALIDATION_ERROR',
    patterns: [/validation failed/i, /invalid input/i, /schema error/i],
    severity: 'medium'
  },
  {
    name: 'RUNTIME_ERROR',
    patterns: [/TypeError/i, /ReferenceError/i, /RangeError/i],
    severity: 'high'
  }
];

// ============================================================================
// Failure Response Manager
// ============================================================================

export class FailureResponseManager {
  constructor(private readonly stateMachine: StateMachine) {}

  /**
   * Analyze a failed task and provide intelligent recommendations
   */
  async handleFailure(taskId: string): Promise<void> {
    const analysis = this.analyzeFailure(taskId);

    if (!analysis.isValid) {
      logWarning('Spurious failure detected', {
        taskId,
        reason: analysis.reason
      });
      // Spurious failures should be ignored - task will be retried
      return;
    }

    logInfo('Failure analysis complete', {
      taskId: analysis.taskId,
      isValid: analysis.isValid,
      reason: analysis.reason,
      errorClass: analysis.errorClass,
      severity: analysis.severity,
      suggestedFix: analysis.suggestedFix,
      shouldReassign: analysis.shouldReassign,
      shouldEscalate: analysis.shouldEscalate
    });

    if (analysis.suggestedFix) {
      logInfo('Suggested fix', {
        taskId,
        fix: analysis.suggestedFix
      });
    }

    if (analysis.shouldEscalate) {
      logError('Task requires human escalation', {
        taskId,
        errorClass: analysis.errorClass,
        severity: analysis.severity
      });
    }

    // The orchestrator will handle actual reassignment/escalation based on these logs
  }

  /**
   * Analyze whether a failure is valid and what should be done
   */
  private analyzeFailure(taskId: string): FailureAnalysis {
    const task = this.stateMachine.getTask(taskId);
    if (!task) {
      return {
        taskId,
        isValid: false,
        reason: 'Task not found',
        errorClass: null,
        severity: null,
        suggestedFix: null,
        shouldReassign: false,
        shouldEscalate: false
      };
    }

    // Only analyze blocked tasks
    if (task.status !== 'blocked') {
      return {
        taskId,
        isValid: false,
        reason: 'Task is not blocked',
        errorClass: null,
        severity: null,
        suggestedFix: null,
        shouldReassign: false,
        shouldEscalate: false
      };
    }

    const errorLog = this.getErrorLog(task);

    // Check 1: Empty or generic error?
    if (!errorLog || errorLog === 'Unknown error' || errorLog.trim() === '') {
      return {
        taskId,
        isValid: false,
        reason: 'Empty or generic error log - likely spurious',
        errorClass: null,
        severity: null,
        suggestedFix: null,
        shouldReassign: false,
        shouldEscalate: false
      };
    }

    // Check 2: Failed too quickly?
    if (task.started_at && task.completed_at) {
      const duration = task.completed_at - task.started_at;
      if (duration < 1000) {
        return {
          taskId,
          isValid: false,
          reason: 'Task failed in <1s - likely infrastructure issue',
          errorClass: null,
          severity: null,
          suggestedFix: 'Retry with different worker',
          shouldReassign: true,
          shouldEscalate: false
        };
      }
    }

    // Classify the error
    const errorClass = this.classifyError(errorLog);

    // Determine if we have a suggested fix
    const suggestedFix = this.getSuggestedFix(errorClass, errorLog);

    // Get failure count to decide on escalation
    const failureCount = this.getFailureCount(task);

    return {
      taskId,
      isValid: true,
      reason: 'Legitimate failure detected',
      errorClass: errorClass?.name || 'UNKNOWN',
      severity: errorClass?.severity || 'medium',
      suggestedFix,
      shouldReassign: failureCount < 2,
      shouldEscalate: failureCount >= 2
    };
  }

  private getErrorLog(task: Task): string {
    if (task.metadata && typeof task.metadata === 'object') {
      const meta = task.metadata as Record<string, unknown>;
      if (typeof meta.error === 'string') {
        return meta.error;
      }
      if (typeof meta.blocker === 'string') {
        return meta.blocker;
      }
      if (typeof meta.output === 'string') {
        return meta.output;
      }
    }
    return '';
  }

  private classifyError(errorLog: string): ErrorClass | null {
    for (const errorClass of ERROR_CLASSES) {
      for (const pattern of errorClass.patterns) {
        if (pattern.test(errorLog)) {
          return errorClass;
        }
      }
    }
    return null;
  }

  private getSuggestedFix(errorClass: ErrorClass | null, errorLog: string): string | null {
    if (!errorClass) return null;

    switch (errorClass.name) {
      case 'FILE_NOT_FOUND':
        // Try to extract the missing file path
        const pathMatch = errorLog.match(/['"]([^'"]+)['"]/);
        if (pathMatch) {
          const missingPath = pathMatch[1];
          // Check for known path corrections
          if (missingPath.includes('verification_loop') && missingPath.includes('standards')) {
            return `Correct path from 'standards/verification_loop.md' to 'concepts/verification_loop.md'`;
          }
          return `Check if file exists at path: ${missingPath}`;
        }
        return 'Verify file paths in task configuration';

      case 'MISSING_DEPENDENCY':
        const moduleMatch = errorLog.match(/module ['"]([^'"]+)['"]/i);
        if (moduleMatch) {
          return `Install missing dependency: npm install ${moduleMatch[1]}`;
        }
        return 'Run npm install to ensure all dependencies are available';

      case 'BUILD_FAILURE':
        return 'Review TypeScript errors and fix compilation issues';

      case 'PERMISSION_DENIED':
        return 'Check file permissions and ensure proper access rights';

      case 'NETWORK_ERROR':
        return 'Retry with network backoff or check connectivity';

      default:
        return null;
    }
  }

  private getFailureCount(task: Task): number {
    if (task.metadata && typeof task.metadata === 'object') {
      const meta = task.metadata as Record<string, unknown>;
      if (typeof meta.failureCount === 'number') {
        return meta.failureCount;
      }
      // Check if there's a failure history array
      if (Array.isArray(meta.failureHistory)) {
        return meta.failureHistory.length;
      }
    }
    return 0;
  }
}
