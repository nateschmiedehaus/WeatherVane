/**
 * Production Feedback Loop (Layer 3)
 *
 * Tracks tasks that were marked "proven" but later failed in production.
 * Creates institutional memory and improves system over time.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveStateRoot } from '../utils/config.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

export interface ProductionFailure {
  taskId: string;
  failureDate: string;
  description: string;
  rootCause: string;
  impact: 'minor' | 'major' | 'critical';
  proofCriteriaGap?: string; // What proof criteria missed this
}

export class ProductionFeedback {
  private workspaceRoot: string;
  private stateRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
  }

  /**
   * Record a production failure for a task that was marked "proven"
   */
  async recordProductionFailure(failure: ProductionFailure): Promise<void> {
    logWarning(`Production failure recorded for ${failure.taskId}`, {
      impact: failure.impact,
      rootCause: failure.rootCause,
    });

    // 1. Mark task as "false_proven"
    await this.markFalseProven(failure.taskId);

    // 2. Add failure report to evidence bundle
    await this.writeFailureReport(failure);

    // 3. Log to analytics for trend analysis
    await this.logToAnalytics(failure);

    logInfo(`Production failure documented for ${failure.taskId}`);
  }

  /**
   * Mark task as falsely proven
   */
  private async markFalseProven(taskId: string): Promise<void> {
    const evidencePath = path.join(this.stateRoot, 'evidence', taskId);
    if (!fs.existsSync(evidencePath)) {
      return;
    }

    const markerPath = path.join(evidencePath, 'FALSE_PROVEN.md');
    const content = `# ⚠️ FALSE PROVEN

This task was marked "proven" but failed in production.

See production_failure.md for details.

**Lesson:** Proof criteria were insufficient. This task serves as a warning
that passing all checks does not guarantee production success.
`;

    fs.writeFileSync(markerPath, content, 'utf-8');
  }

  /**
   * Write detailed failure report
   */
  private async writeFailureReport(failure: ProductionFailure): Promise<void> {
    const evidencePath = path.join(this.stateRoot, 'evidence', failure.taskId);
    if (!fs.existsSync(evidencePath)) {
      fs.mkdirSync(evidencePath, { recursive: true });
    }

    const reportPath = path.join(evidencePath, 'production_failure.md');
    const content = `# Production Failure Report

**Task ID:** ${failure.taskId}
**Failure Date:** ${failure.failureDate}
**Impact:** ${failure.impact.toUpperCase()}

## Description

${failure.description}

## Root Cause

${failure.rootCause}

## Proof Criteria Gap

${failure.proofCriteriaGap || 'Not identified'}

## Lesson Learned

This task passed all proof criteria but still failed in production. This indicates:
1. Proof criteria were incomplete
2. Edge cases were not covered in tests
3. Runtime scenarios were not realistic

## Recommended Improvements

- Update proof criteria template to include this scenario
- Add automated checks for similar issues
- Review and strengthen test coverage

---

**Recorded:** ${new Date().toISOString()}
`;

    fs.writeFileSync(reportPath, content, 'utf-8');
  }

  /**
   * Log to analytics for trend analysis
   */
  private async logToAnalytics(failure: ProductionFailure): Promise<void> {
    const analyticsPath = path.join(this.stateRoot, 'analytics', 'production_failures.jsonl');

    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      taskId: failure.taskId,
      failureDate: failure.failureDate,
      impact: failure.impact,
      rootCause: failure.rootCause,
      proofCriteriaGap: failure.proofCriteriaGap,
    });

    // Ensure directory exists
    const dir = path.dirname(analyticsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Append to JSONL file
    fs.appendFileSync(analyticsPath, logEntry + '\n', 'utf-8');
  }

  /**
   * Get failure statistics
   */
  getFailureStats(): {
    total: number;
    byImpact: Record<string, number>;
    recentFailures: ProductionFailure[];
  } {
    const analyticsPath = path.join(this.stateRoot, 'analytics', 'production_failures.jsonl');

    if (!fs.existsSync(analyticsPath)) {
      return { total: 0, byImpact: {}, recentFailures: [] };
    }

    const lines = fs.readFileSync(analyticsPath, 'utf-8').trim().split('\n');
    const failures = lines.map((line) => JSON.parse(line));

    const byImpact: Record<string, number> = {};
    for (const failure of failures) {
      byImpact[failure.impact] = (byImpact[failure.impact] || 0) + 1;
    }

    return {
      total: failures.length,
      byImpact,
      recentFailures: failures.slice(-10), // Last 10
    };
  }
}
