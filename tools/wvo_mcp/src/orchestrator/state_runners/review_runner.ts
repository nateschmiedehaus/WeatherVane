/**
 * Review State Runner
 *
 * Handles the "review" state: runs code review and critical audit.
 */

import type { CriticalAgent } from '../critical_agent.js';
import type { ReviewerAgent } from '../reviewer_agent.js';

import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface ReviewRunnerDeps {
  reviewer: ReviewerAgent;
  critical: CriticalAgent;
}

export interface ReviewRunnerContext extends RunnerContext {
  patchHash: string;
  coverageDelta: number;
}

/**
 * Run the review state
 *
 * Calls reviewer and critical agents to evaluate code quality.
 * Returns to plan if review rejects or critical issues found, otherwise proceeds to pr.
 *
 * @param context - Runner context with patch hash and coverage delta
 * @param deps - Dependencies (reviewer and critical agents)
 * @returns Result with nextState='pr' or 'plan'
 */
export async function runReview(
  context: ReviewRunnerContext,
  deps: ReviewRunnerDeps
): Promise<RunnerResult> {
  const { task, patchHash, coverageDelta } = context;

  if (!patchHash) {
    throw new Error('Review requires patch hash from previous implement state');
  }

  // Run reviewer assessment
  const review = await deps.reviewer.review({
    task,
    patchHash,
    coverageDelta,
    modelSelection: context.modelSelection, // Pass ComplexityRouter selection
  });

  // Run critical audit
  const critical = await deps.critical.audit({
    task,
    patchHash,
  });

  // Build artifacts
  const artifacts = {
    review: { review, critical },
  };

  // Check if review approved and no critical issues
  if (!review.approved || critical.issues.length > 0) {
    return {
      success: false,
      nextState: 'plan',
      artifacts,
      notes: ['Review or critical gate failed; returning to Plan.'],
      requirePlanDelta: true,
      modelSelection: review.model,
    };
  }

  // Review approved and clean - proceed to PR
  return {
    success: true,
    nextState: 'pr',
    artifacts,
    notes: ['Review approved and critical gate clean.'],
    modelSelection: review.model,
  };
}
