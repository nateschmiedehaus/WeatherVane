/**
 * Implement State Runner
 *
 * Handles the "implement" state: applies implementation patch and detects duplicates.
 */

import type { ImplementerAgent, ImplementerAgentResult } from '../implementer_agent.js';

import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface ImplementRunnerDeps {
  implementer: ImplementerAgent;
}

export interface ImplementRunnerContext extends RunnerContext {
  planHash: string;
  insights?: string[];
  patchHistory?: Set<string>;
}

/**
 * Run the implement state
 *
 * Calls implementer to apply patch, checks for duplicates,
 * and determines if plan delta is needed.
 *
 * @param context - Runner context with task, plan hash, and patch history
 * @param deps - Dependencies (implementer agent)
 * @returns Result with nextState='verify' or 'plan'
 */
export async function runImplement(
  context: ImplementRunnerContext,
  deps: ImplementRunnerDeps
): Promise<RunnerResult> {
  const { task, planHash, insights = [], patchHistory } = context;

  if (!planHash) {
    throw new Error('Implement requires plan hash from previous plan state');
  }

  // Call implementer to apply patch
  const implementResult = await deps.implementer.apply({
    task,
    planHash,
    insights,
    modelSelection: context.modelSelection, // Pass ComplexityRouter selection
  });

  // Check if implementation failed
  if (!implementResult.success) {
    return {
      success: false,
      nextState: 'plan',
      artifacts: {},
      notes: ['Implementation failed, returning to plan.'],
      requirePlanDelta: true, // Require new plan before retry
    };
  }

  // Check for duplicate patch
  if (patchHistory && patchHistory.has(implementResult.patchHash)) {
    return {
      success: false,
      nextState: 'plan',
      artifacts: {},
      notes: [`Duplicate patch ${implementResult.patchHash.slice(0, 8)} detected.`],
      requirePlanDelta: true, // Require new plan to avoid infinite loop
    };
  }

  // Success - proceed to verify
  return {
    success: true,
    nextState: 'verify',
    artifacts: {
      implement: implementResult,
    },
    notes: [`Patch ${implementResult.patchHash.slice(0, 8)} emitted.`],
    modelSelection: implementResult.model,
  };
}
