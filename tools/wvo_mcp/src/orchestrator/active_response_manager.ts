/**
 * Active Response Manager - Monitors failures/alerts/blockers and activates orchestrator
 *
 * Purpose: Ensure orchestrator is ACTIVE (not idle) when issues occur
 *
 * This system monitors:
 * - Task failures (execution errors, timeout, crashes)
 * - Alerts (critic warnings, system alerts, resource issues)
 * - Blockers (dependency issues, missing resources)
 * - Any other hurdles preventing progress
 *
 * When issues detected, it:
 * 1. Activates orchestrator (prevents idle state)
 * 2. Diagnoses root cause
 * 3. Creates remediation tasks
 * 4. Escalates if unresolvable
 *
 * Philosophy:
 * - Failures should trigger ACTION, not idleness
 * - Orchestrator is the "first responder" for system issues
 * - Proactive diagnosis beats reactive firefighting
 */

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

import type { PolicyEngine } from './policy_engine.js';
import type { StateMachine } from './state_machine.js';
import type { Task } from './task_types.js';

/**
 * Issue types the Active Response Manager monitors
 */
export type IssueType = 'task_failure' | 'alert' | 'blocker' | 'critic_failure' | 'resource_issue' | 'dependency_deadlock';

/**
 * Severity levels for issues
 */
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Detected issue requiring orchestrator attention
 */
export interface DetectedIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  timestamp: number;
  title: string;
  description: string;
  affectedTasks: string[];
  context: Record<string, unknown>;
  suggestedActions: string[];
}

/**
 * Response action the orchestrator should take
 */
export interface ResponseAction {
  type: 'diagnose' | 'remediate' | 'escalate' | 'retry' | 'unblock';
  issueId: string;
  description: string;
  priority: number; // 0-100, higher = more urgent
  estimatedDuration: number; // minutes
  requiresHuman?: boolean;
}

/**
 * Active Response Manager configuration
 */
export interface ActiveResponseManagerOptions {
  /**
   * Maximum failures before escalating to human
   */
  maxFailuresBeforeEscalation?: number;

  /**
   * Time window (ms) to track failure patterns
   */
  failureWindowMs?: number;

  /**
   * Maximum blocked tasks before triggering dependency review
   */
  maxBlockedTasksBeforeReview?: number;

  /**
   * Enable automatic remediation task creation
   */
  autoCreateRemediationTasks?: boolean;

  /**
   * Minimum severity to activate orchestrator
   */
  minSeverityForActivation?: IssueSeverity;
}

/**
 * Active Response Manager
 *
 * Monitors system health and activates orchestrator to resolve issues
 */
export class ActiveResponseManager {
  private options: Required<ActiveResponseManagerOptions>;
  private detectedIssues: Map<string, DetectedIssue> = new Map();
  private remediationTasks: Map<string, string> = new Map(); // issueId -> taskId
  private failureHistory: Array<{ timestamp: number; taskId: string; reason: string }> = [];

  constructor(options: ActiveResponseManagerOptions = {}) {
    this.options = {
      maxFailuresBeforeEscalation: options.maxFailuresBeforeEscalation ?? 5,
      failureWindowMs: options.failureWindowMs ?? 3600000, // 1 hour
      maxBlockedTasksBeforeReview: options.maxBlockedTasksBeforeReview ?? 10,
      autoCreateRemediationTasks: options.autoCreateRemediationTasks ?? true,
      minSeverityForActivation: options.minSeverityForActivation ?? 'medium',
    };
  }

  /**
   * Check system health and detect issues
   * Returns ResponseAction[] if orchestrator should activate
   */
  async checkHealth(stateMachine: StateMachine, policyEngine?: PolicyEngine): Promise<ResponseAction[]> {
    const actions: ResponseAction[] = [];
    const now = Date.now();

    // Clean up old issues
    this.cleanupOldIssues(now);

    // 1. Detect task failures
    const failureIssues = await this.detectTaskFailures(stateMachine);
    failureIssues.forEach(issue => {
      this.detectedIssues.set(issue.id, issue);
      actions.push(...this.createResponseActions(issue));
    });

    // 2. Detect blockers
    const blockerIssues = await this.detectBlockers(stateMachine);
    blockerIssues.forEach(issue => {
      this.detectedIssues.set(issue.id, issue);
      actions.push(...this.createResponseActions(issue));
    });

    // 3. Detect critic failures
    if (policyEngine) {
      const criticIssues = await this.detectCriticFailures(policyEngine);
      criticIssues.forEach(issue => {
        this.detectedIssues.set(issue.id, issue);
        actions.push(...this.createResponseActions(issue));
      });
    }

    // 4. Detect dependency deadlocks
    const deadlockIssues = await this.detectDependencyDeadlocks(stateMachine);
    deadlockIssues.forEach(issue => {
      this.detectedIssues.set(issue.id, issue);
      actions.push(...this.createResponseActions(issue));
    });

    // 5. Detect alerts (from state files, logs, etc.)
    const alertIssues = await this.detectAlerts();
    alertIssues.forEach(issue => {
      this.detectedIssues.set(issue.id, issue);
      actions.push(...this.createResponseActions(issue));
    });

    // Sort actions by priority (highest first)
    actions.sort((a, b) => b.priority - a.priority);

    // Log summary
    if (actions.length > 0) {
      logWarning(`Active Response: ${actions.length} actions required`, {
        issues: this.detectedIssues.size,
        priorities: actions.map(a => a.priority),
      });
    }

    return actions;
  }

  /**
   * Detect failed tasks
   */
  private async detectTaskFailures(stateMachine: StateMachine): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];
    const now = Date.now();

    // Check for tasks in failed state (via metadata)
    const allTasks = stateMachine.getTasks({});
    const failedTasks = allTasks.filter(task => {
      const meta = task.metadata as Record<string, unknown> | undefined;
      return meta?.['failed'] === true || meta?.['execution_error'];
    });

    if (failedTasks.length > 0) {
      // Track failure history
      failedTasks.forEach(task => {
        this.failureHistory.push({
          timestamp: now,
          taskId: task.id,
          reason: String((task.metadata as any)?.execution_error ?? 'unknown'),
        });
      });

      // Clean old failures
      this.failureHistory = this.failureHistory.filter(
        f => now - f.timestamp < this.options.failureWindowMs
      );

      // Detect failure patterns
      const recentFailureCount = this.failureHistory.length;
      const severity: IssueSeverity = recentFailureCount >= this.options.maxFailuresBeforeEscalation
        ? 'critical'
        : recentFailureCount >= 3
        ? 'high'
        : 'medium';

      issues.push({
        id: `task-failures-${now}`,
        type: 'task_failure',
        severity,
        timestamp: now,
        title: `${failedTasks.length} task(s) failed`,
        description: `Recent task failures: ${failedTasks.map(t => t.id).join(', ')}. ${recentFailureCount} failures in last hour.`,
        affectedTasks: failedTasks.map(t => t.id),
        context: {
          recentFailureCount,
          failures: this.failureHistory.slice(-10),
          patternDetected: this.detectFailurePattern(),
        },
        suggestedActions: [
          'Review failure logs and error messages',
          'Check for common root cause (environment, dependencies, resources)',
          'Create remediation tasks for systematic issues',
          severity === 'critical' ? 'ESCALATE TO HUMAN - Repeated failures' : 'Auto-remediate if possible',
        ],
      });
    }

    return issues;
  }

  /**
   * Detect blocked tasks
   */
  private async detectBlockers(stateMachine: StateMachine): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];
    const now = Date.now();

    const blockedTasks = stateMachine.getTasks({ status: ['blocked'] });

    if (blockedTasks.length >= this.options.maxBlockedTasksBeforeReview) {
      // Analyze blocker reasons
      const blockerReasons = new Map<string, string[]>();
      blockedTasks.forEach(task => {
        const deps = stateMachine.getDependencies(task.id).map((d: { depends_on_task_id: string }) => d.depends_on_task_id);
        const pendingDeps = deps.filter((depId: string) => {
          const depTask = stateMachine.getTask(depId);
          return depTask && depTask.status !== 'done';
        });

        const reason = pendingDeps.length > 0
          ? `Waiting on: ${pendingDeps.join(', ')}`
          : 'Unknown blocker';

        if (!blockerReasons.has(reason)) {
          blockerReasons.set(reason, []);
        }
        blockerReasons.get(reason)!.push(task.id);
      });

      issues.push({
        id: `blockers-${now}`,
        type: 'blocker',
        severity: 'high',
        timestamp: now,
        title: `${blockedTasks.length} tasks blocked`,
        description: `Excessive blocked tasks. Review dependencies and unblock critical path.`,
        affectedTasks: blockedTasks.map(t => t.id),
        context: {
          blockedCount: blockedTasks.length,
          blockerReasons: Array.from(blockerReasons.entries()).map(([reason, tasks]) => ({
            reason,
            count: tasks.length,
            tasks: tasks.slice(0, 5), // Sample
          })),
        },
        suggestedActions: [
          'Review dependency chains for circular dependencies',
          'Identify tasks blocking the most downstream work',
          'Consider splitting large tasks to unblock partial progress',
          'Mark non-critical dependencies as optional',
        ],
      });
    }

    return issues;
  }

  /**
   * Detect critic failures
   */
  private async detectCriticFailures(policyEngine: PolicyEngine): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];
    const now = Date.now();

    // Check policy engine for critic failure tracking
    // This would integrate with existing critic monitoring
    // For now, placeholder for future integration

    return issues;
  }

  /**
   * Detect dependency deadlocks (circular dependencies or impossible states)
   */
  private async detectDependencyDeadlocks(stateMachine: StateMachine): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];
    const now = Date.now();

    // Build dependency graph
    const allTasks = stateMachine.getTasks({});
    const graph = new Map<string, Set<string>>();
    allTasks.forEach(task => {
      const deps = (task as any).dependencies ?? [];
      graph.set(task.id, new Set(deps));
    });

    // Detect cycles using DFS
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (taskId: string, path: string[]): void => {
      if (visited.has(taskId)) return;
      if (visiting.has(taskId)) {
        // Cycle detected
        const cycleStart = path.indexOf(taskId);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }

      visiting.add(taskId);
      path.push(taskId);

      const deps = graph.get(taskId) ?? new Set();
      deps.forEach(depId => {
        if (graph.has(depId)) {
          dfs(depId, [...path]);
        }
      });

      visiting.delete(taskId);
      visited.add(taskId);
    };

    allTasks.forEach(task => {
      if (!visited.has(task.id)) {
        dfs(task.id, []);
      }
    });

    if (cycles.length > 0) {
      issues.push({
        id: `deadlock-${now}`,
        type: 'dependency_deadlock',
        severity: 'critical',
        timestamp: now,
        title: `${cycles.length} dependency cycle(s) detected`,
        description: `Circular dependencies prevent progress. Manual intervention required.`,
        affectedTasks: cycles.flat(),
        context: {
          cycles,
        },
        suggestedActions: [
          'ESCALATE TO HUMAN - Circular dependencies require manual resolution',
          'Review dependency chain: ' + cycles[0]?.join(' → '),
          'Break cycle by removing or reordering dependencies',
        ],
      });
    }

    return issues;
  }

  /**
   * Detect alerts from state files, logs, etc.
   */
  private async detectAlerts(): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];
    // This would integrate with alert systems
    // Placeholder for now
    return issues;
  }

  /**
   * Create response actions for an issue
   */
  private createResponseActions(issue: DetectedIssue): ResponseAction[] {
    const actions: ResponseAction[] = [];
    const severityPriority = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25,
    };

    const basePriority = severityPriority[issue.severity];

    switch (issue.type) {
      case 'task_failure':
        actions.push({
          type: 'diagnose',
          issueId: issue.id,
          description: `Diagnose root cause of ${issue.affectedTasks.length} task failure(s)`,
          priority: basePriority + 10,
          estimatedDuration: 15,
        });

        if (issue.severity === 'critical') {
          actions.push({
            type: 'escalate',
            issueId: issue.id,
            description: `ESCALATE: ${this.failureHistory.length} failures in last hour`,
            priority: 100,
            estimatedDuration: 5,
            requiresHuman: true,
          });
        } else {
          actions.push({
            type: 'remediate',
            issueId: issue.id,
            description: `Create remediation task(s) for failed work`,
            priority: basePriority,
            estimatedDuration: 20,
          });
        }
        break;

      case 'blocker':
        actions.push({
          type: 'unblock',
          issueId: issue.id,
          description: `Unblock ${issue.affectedTasks.length} blocked tasks`,
          priority: basePriority,
          estimatedDuration: 30,
        });
        break;

      case 'dependency_deadlock':
        actions.push({
          type: 'escalate',
          issueId: issue.id,
          description: `ESCALATE: Circular dependency requires manual intervention`,
          priority: 100,
          estimatedDuration: 10,
          requiresHuman: true,
        });
        break;

      default:
        actions.push({
          type: 'diagnose',
          issueId: issue.id,
          description: `Investigate ${issue.type}: ${issue.title}`,
          priority: basePriority,
          estimatedDuration: 20,
        });
    }

    return actions;
  }

  /**
   * Detect failure patterns (same error repeating)
   */
  private detectFailurePattern(): string | null {
    if (this.failureHistory.length < 3) return null;

    const reasons = this.failureHistory.slice(-5).map(f => f.reason);
    const uniqueReasons = new Set(reasons);

    if (uniqueReasons.size === 1) {
      return `Same error repeating: ${reasons[0]}`;
    }

    if (uniqueReasons.size === 2) {
      return `Alternating errors: ${Array.from(uniqueReasons).join(' / ')}`;
    }

    return null;
  }

  /**
   * Clean up old issues
   */
  private cleanupOldIssues(now: number): void {
    const maxAge = this.options.failureWindowMs;
    for (const [id, issue] of this.detectedIssues) {
      if (now - issue.timestamp > maxAge) {
        this.detectedIssues.delete(id);
        this.remediationTasks.delete(id);
      }
    }
  }

  /**
   * Get current issues
   */
  getIssues(): DetectedIssue[] {
    return Array.from(this.detectedIssues.values());
  }

  /**
   * Get issue by ID
   */
  getIssue(id: string): DetectedIssue | undefined {
    return this.detectedIssues.get(id);
  }

  /**
   * Mark issue as resolved
   */
  resolveIssue(id: string): void {
    this.detectedIssues.delete(id);
    this.remediationTasks.delete(id);
    logInfo(`Issue resolved: ${id}`);
  }

  /**
   * Check if orchestrator should be active (not idle)
   * Returns true if there are unresolved issues
   */
  shouldOrchestratorBeActive(): boolean {
    const activeIssues = Array.from(this.detectedIssues.values()).filter(issue => {
      // Only activate for medium+ severity
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      const minSeverity = severityOrder[this.options.minSeverityForActivation];
      return severityOrder[issue.severity] >= minSeverity;
    });

    return activeIssues.length > 0;
  }

  /**
   * Get summary for logging
   */
  getSummary(): {
    totalIssues: number;
    bySeverity: Record<IssueSeverity, number>;
    byType: Record<IssueType, number>;
    shouldBeActive: boolean;
  } {
    const issues = Array.from(this.detectedIssues.values());

    const bySeverity = issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
      return acc;
    }, {} as Record<IssueSeverity, number>);

    const byType = issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] ?? 0) + 1;
      return acc;
    }, {} as Record<IssueType, number>);

    return {
      totalIssues: issues.length,
      bySeverity,
      byType,
      shouldBeActive: this.shouldOrchestratorBeActive(),
    };
  }
}
