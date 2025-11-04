/**
 * PeerReviewManager - Final quality gate before task completion
 *
 * Essential #6: Ensures logic correctness through peer review
 *
 * Flow:
 * 1. Complex task completes → Mark as 'needs_review'
 * 2. Assign to different worker (peer reviewer)
 * 3. Reviewer checks logic, tests, documentation
 * 4. Approve → 'done' OR Request changes → 'needs_improvement'
 *
 * Pattern: Inspired by GitHub pull request reviews and GitLab merge request approvals
 */

import { logInfo, logDebug } from '../telemetry/logger.js';

import type { Agent } from './agent_pool.js';
import type { RoadmapTracker } from './roadmap_tracker.js';
import type { StateMachine, Task } from './state_machine.js';


export interface ReviewCriteria {
  logicCorrectness: boolean;
  testCoverage: boolean;
  documentation: boolean;
  criticAlignment: boolean;
}

export interface ReviewResult {
  approved: boolean;
  feedback: string;
  criteria: ReviewCriteria;
  reviewerId: string;
}

export class PeerReviewManager {
  private reviewAssignments: Map<string, string> = new Map(); // taskId -> reviewerId
  private pendingReviews: Set<string> = new Set(); // taskIds awaiting review

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly roadmapTracker: RoadmapTracker,
    private readonly workspaceRoot: string
  ) {}

  /**
   * Determine if a task requires peer review
   */
  requiresReview(task: Task): boolean {
    // Review required for:
    // 1. Complex tasks (estimated_complexity >= 5)
    if (task.estimated_complexity && task.estimated_complexity >= 5) {
      logDebug('Task requires review: high complexity', {
        taskId: task.id,
        complexity: task.estimated_complexity,
      });
      return true;
    }

    // 2. Security-sensitive tasks
    if (task.metadata?.affects_security === true) {
      logDebug('Task requires review: security-sensitive', { taskId: task.id });
      return true;
    }

    // 3. Public API changes
    if (task.metadata?.public_api === true) {
      logDebug('Task requires review: public API change', { taskId: task.id });
      return true;
    }

    // 4. Epic-level tasks
    if (task.type === 'epic') {
      logDebug('Task requires review: epic level', { taskId: task.id });
      return true;
    }

    return false;
  }

  /**
   * Mark task as needing review and assign reviewer
   */
  async requestReview(
    task: Task,
    implementerId: string,
    output: string
  ): Promise<void> {
    // Mark task as needs_review in roadmap
    await this.roadmapTracker.updateTaskStatus(task.id, 'needs_review' as any, {
      agent: implementerId,
      output,
    });

    this.pendingReviews.add(task.id);

    logInfo('Task marked for peer review', {
      taskId: task.id,
      implementer: implementerId,
      complexity: task.estimated_complexity,
    });
  }

  /**
   * Assign a peer reviewer to a task
   * Returns the reviewer agent, or null if no suitable reviewer available
   */
  async assignReviewer(
    task: Task,
    implementerId: string,
    availableAgents: Agent[]
  ): Promise<Agent | null> {
    // Find an idle agent that is NOT the implementer
    const eligibleReviewers = availableAgents.filter(
      agent =>
        agent.status === 'idle' &&
        agent.id !== implementerId &&
        (agent.config.role === 'worker' || agent.config.role === 'critic')
    );

    if (eligibleReviewers.length === 0) {
      logDebug('No eligible reviewers available', {
        taskId: task.id,
        implementer: implementerId,
      });
      return null;
    }

    // Prefer critics for review, otherwise use any worker
    const reviewer =
      eligibleReviewers.find(a => a.config.role === 'critic') || eligibleReviewers[0];

    this.reviewAssignments.set(task.id, reviewer.id);

    logInfo('Peer reviewer assigned', {
      taskId: task.id,
      reviewer: reviewer.id,
      implementer: implementerId,
    });

    return reviewer;
  }

  /**
   * Get next task awaiting review
   */
  getNextReviewTask(): string | null {
    const pending = Array.from(this.pendingReviews);
    return pending.length > 0 ? pending[0] : null;
  }

  /**
   * Complete a review with approval or rejection
   */
  async completeReview(
    task: Task,
    reviewerId: string,
    approved: boolean,
    feedback: string
  ): Promise<void> {
    this.pendingReviews.delete(task.id);
    this.reviewAssignments.delete(task.id);

    if (approved) {
      // Approve: Mark task as done
      await this.roadmapTracker.updateTaskStatus(task.id, 'done', {
        agent: reviewerId,
        output: feedback,
      });

      logInfo('Peer review approved - task marked done', {
        taskId: task.id,
        reviewer: reviewerId,
      });
    } else {
      // Request changes: Mark as needs_improvement (back to pending)
      await this.roadmapTracker.updateTaskStatus(task.id, 'pending', {
        agent: reviewerId,
        output: feedback,
      });

      logInfo('Peer review requested changes - task returned for rework', {
        taskId: task.id,
        reviewer: reviewerId,
        feedback: feedback.substring(0, 100),
      });
    }
  }

  /**
   * Generate review prompt for the reviewer agent
   */
  generateReviewPrompt(task: Task, implementationOutput: string): string {
    return `# Peer Review: ${task.title || task.id}

You are conducting a peer review of the completed work on this task.

## Task Information
- **Task ID**: ${task.id}
- **Title**: ${task.title || 'N/A'}
- **Description**: ${task.description || 'N/A'}
- **Complexity**: ${task.estimated_complexity || 'N/A'}

## Implementation Output
\`\`\`
${implementationOutput}
\`\`\`

## Review Criteria

Please review the implementation against these criteria:

1. **Logic Correctness**: Does the implementation correctly solve the task requirements?
2. **Test Coverage**: Are there adequate tests for the changes?
3. **Documentation**: Is the code well-documented and changes explained?
4. **Critic Alignment**: Does this align with project standards and critic requirements?

## Review Decision

Based on your review, provide:

1. **APPROVE** if the implementation meets all criteria and is ready to merge
2. **REQUEST CHANGES** if improvements are needed before merging

Provide constructive feedback explaining your decision and any specific concerns or recommendations.`;
  }

  /**
   * Get statistics for monitoring
   */
  getReviewStats(): {
    pendingReviews: number;
    activeAssignments: number;
  } {
    return {
      pendingReviews: this.pendingReviews.size,
      activeAssignments: this.reviewAssignments.size,
    };
  }
}
