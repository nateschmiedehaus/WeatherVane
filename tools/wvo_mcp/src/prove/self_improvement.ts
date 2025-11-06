/**
 * Self-Improvement System
 *
 * Automatically reviews completed work and creates improvement tasks at reasonable cadence.
 * Uses AFP/SCAS principles to identify genuine improvement opportunities.
 * Avoids infinite loops through smart prioritization and cadence control.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveStateRoot } from '../utils/config.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

export interface ImprovementOpportunity {
  taskId: string;
  reason: 'via_negativa' | 'refactor' | 'test_coverage' | 'complexity_reduction' | 'production_feedback';
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimatedLOC: number;
}

export class SelfImprovementSystem {
  private workspaceRoot: string;
  private stateRoot: string;
  private readonly REVIEW_CADENCE_DAYS = 30; // Review tasks every 30 days
  private readonly MAX_IMPROVEMENTS_PER_CYCLE = 3; // Avoid overwhelming with improvements

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = resolveStateRoot(workspaceRoot);
  }

  /**
   * Scan for improvement opportunities across all completed tasks
   */
  async scanForImprovements(): Promise<ImprovementOpportunity[]> {
    const evidencePath = path.join(this.stateRoot, 'evidence');
    if (!fs.existsSync(evidencePath)) {
      return [];
    }

    const taskDirs = fs.readdirSync(evidencePath).filter((dir) => dir.startsWith('AFP-'));
    const opportunities: ImprovementOpportunity[] = [];

    for (const taskDir of taskDirs) {
      const taskPath = path.join(evidencePath, taskDir);

      // Skip if recently reviewed
      if (this.wasRecentlyReviewed(taskDir)) {
        continue;
      }

      // Check for improvement opportunities
      const opps = await this.analyzeTaskForImprovements(taskDir, taskPath);
      opportunities.push(...opps);
    }

    // Sort by priority and limit
    return opportunities
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })
      .slice(0, this.MAX_IMPROVEMENTS_PER_CYCLE);
  }

  /**
   * Analyze single task for improvement opportunities
   */
  private async analyzeTaskForImprovements(
    taskId: string,
    taskPath: string
  ): Promise<ImprovementOpportunity[]> {
    const opportunities: ImprovementOpportunity[] = [];

    // 1. Check for production failures (highest priority)
    if (fs.existsSync(path.join(taskPath, 'FALSE_PROVEN.md'))) {
      opportunities.push({
        taskId,
        reason: 'production_feedback',
        description: 'Task failed in production despite being marked proven',
        priority: 'high',
        estimatedLOC: 50,
      });
    }

    // 2. Check for via negativa opportunities (deletion potential)
    const planPath = path.join(taskPath, 'plan.md');
    if (fs.existsSync(planPath)) {
      const plan = fs.readFileSync(planPath, 'utf-8');

      // Look for signs that code could be deleted/simplified
      if (plan.includes('workaround') || plan.includes('temporary')) {
        opportunities.push({
          taskId,
          reason: 'via_negativa',
          description: 'Task contains workarounds or temporary code that could be removed',
          priority: 'medium',
          estimatedLOC: -20, // Negative = deletion
        });
      }
    }

    // 3. Check for refactoring opportunities
    const designPath = path.join(taskPath, 'design.md');
    if (fs.existsSync(designPath)) {
      const design = fs.readFileSync(designPath, 'utf-8');

      // Look for complexity admissions
      if (design.includes('technical debt') || design.includes('needs refactor')) {
        opportunities.push({
          taskId,
          reason: 'refactor',
          description: 'Task identified technical debt or refactoring needs',
          priority: 'medium',
          estimatedLOC: 100,
        });
      }
    }

    // 4. Check for test coverage gaps
    const verifyPath = path.join(taskPath, 'verify.md');
    if (fs.existsSync(verifyPath)) {
      const verify = fs.readFileSync(verifyPath, 'utf-8');

      // Look for skipped tests
      if (verify.includes('skipped') || verify.includes('Manual check')) {
        opportunities.push({
          taskId,
          reason: 'test_coverage',
          description: 'Task has skipped or manual checks that could be automated',
          priority: 'low',
          estimatedLOC: 30,
        });
      }
    }

    return opportunities;
  }

  /**
   * Check if task was recently reviewed
   */
  private wasRecentlyReviewed(taskId: string): boolean {
    const reviewTrackerPath = path.join(this.stateRoot, 'analytics', 'self_improvement_reviews.jsonl');

    if (!fs.existsSync(reviewTrackerPath)) {
      return false;
    }

    const lines = fs.readFileSync(reviewTrackerPath, 'utf-8').trim().split('\n');
    for (const line of lines) {
      const review = JSON.parse(line);
      if (review.taskId === taskId) {
        const reviewDate = new Date(review.timestamp);
        const daysSinceReview = (Date.now() - reviewDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceReview < this.REVIEW_CADENCE_DAYS) {
          return true; // Reviewed recently
        }
      }
    }

    return false;
  }

  /**
   * Create improvement tasks from opportunities
   */
  async createImprovementTasks(opportunities: ImprovementOpportunity[]): Promise<string[]> {
    const createdTasks: string[] = [];

    for (const opp of opportunities) {
      const improvementTaskId = `${opp.taskId}-IMPROVE-${Date.now()}`;

      // Create evidence directory
      const evidencePath = path.join(this.stateRoot, 'evidence', improvementTaskId);
      fs.mkdirSync(evidencePath, { recursive: true });

      // Create improvement task spec
      const specContent = `# Improvement Task: ${improvementTaskId}

**Original Task:** ${opp.taskId}
**Reason:** ${opp.reason.replace(/_/g, ' ')}
**Priority:** ${opp.priority.toUpperCase()}

## Description

${opp.description}

## AFP/SCAS Improvement Type

**${this.getImprovementTypeDescription(opp.reason)}**

## Scope

- Original task: ${opp.taskId}
- Estimated LOC change: ${opp.estimatedLOC > 0 ? '+' : ''}${opp.estimatedLOC}
- Priority: ${opp.priority}

## Success Criteria

- ${this.getSuccessCriteria(opp.reason)}

---

**Auto-generated by Self-Improvement System**
**Created:** ${new Date().toISOString()}
`;

      fs.writeFileSync(path.join(evidencePath, 'spec.md'), specContent, 'utf-8');

      // Log review
      this.logReview(opp.taskId, improvementTaskId);

      createdTasks.push(improvementTaskId);
      logInfo(`Created improvement task ${improvementTaskId} for ${opp.taskId}`);
    }

    return createdTasks;
  }

  /**
   * Get improvement type description
   */
  private getImprovementTypeDescription(reason: string): string {
    const descriptions: Record<string, string> = {
      via_negativa: 'Via Negativa: Remove workarounds and temporary code. Simplify by deletion.',
      refactor: 'Refactor vs Repair: Address technical debt at root cause, not surface symptoms.',
      test_coverage: 'Antifragility: Strengthen system by adding automated tests.',
      complexity_reduction: 'Simplicity: Reduce cognitive complexity, improve clarity.',
      production_feedback: 'Skin in the Game: Fix false proven task based on production failure.',
    };

    return descriptions[reason] || 'General improvement';
  }

  /**
   * Get success criteria for improvement type
   */
  private getSuccessCriteria(reason: string): string {
    const criteria: Record<string, string> = {
      via_negativa: 'Net LOC reduction, no functionality lost, tests still pass',
      refactor: 'Complexity metrics improved, technical debt removed, tests pass',
      test_coverage: 'Manual checks automated, test coverage increased, no skipped tests',
      complexity_reduction: 'Cyclomatic complexity reduced, clearer interfaces, simpler flow',
      production_feedback: 'Production failure fixed, proof criteria updated, no regression',
    };

    return criteria[reason] || 'Improvement validated by proof system';
  }

  /**
   * Log review to prevent re-scanning too soon
   */
  private logReview(taskId: string, improvementTaskId: string): void {
    const trackerPath = path.join(this.stateRoot, 'analytics', 'self_improvement_reviews.jsonl');

    // Ensure directory exists
    const dir = path.dirname(trackerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      taskId,
      improvementTaskId,
    });

    fs.appendFileSync(trackerPath, logEntry + '\n', 'utf-8');
  }

  /**
   * Check if should run improvement cycle
   */
  shouldRunImprovementCycle(): boolean {
    // Only run when roadmap has <5 pending tasks (don't overwhelm)
    const roadmapPath = path.join(this.stateRoot, 'roadmap.yaml');
    if (!fs.existsSync(roadmapPath)) {
      return false;
    }

    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const pendingCount = (content.match(/status:\s*pending/g) || []).length;

    return pendingCount < 5; // Only create improvements when queue is light
  }
}
