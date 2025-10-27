/**
 * Plan State Runner
 *
 * Handles the "plan" state: creates implementation plan and determines if thinker is needed.
 */

import type { PlannerAgent } from '../planner_agent.js';

import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface PlanRunnerDeps {
  planner: PlannerAgent;
}

export interface PlanRunnerContext extends RunnerContext {
  requirePlanDelta?: boolean;
  previousPlanHash?: string;
  pendingThinker?: boolean;
  spikeBranch?: string;
}

/**
 * Run the plan state
 *
 * Calls planner to create implementation plan, checks for plan hash changes,
 * and determines if thinker exploration is needed.
 *
 * @param context - Runner context with task and flags
 * @param deps - Dependencies (planner agent)
 * @returns Result with nextState='thinker' or 'implement'
 */
export async function runPlan(
  context: PlanRunnerContext,
  deps: PlanRunnerDeps
): Promise<RunnerResult> {
  const { task, attemptNumber, modelSelection, requirePlanDelta, previousPlanHash, pendingThinker, spikeBranch } = context;

  // Call planner to create implementation plan
  const planResult = await deps.planner.run({
    task,
    attempt: attemptNumber,
    requireDelta: requirePlanDelta ?? false,
    modelSelection, // Pass ComplexityRouter selection
  });

  // If plan delta was required, verify hash changed
  if (requirePlanDelta && previousPlanHash && previousPlanHash === planResult.planHash) {
    throw new Error('Plan delta required but plan hash unchanged');
  }

  // Build notes
  const notes: string[] = [];
  notes.push(`Plan hash ${planResult.planHash.slice(0, 8)} recorded.`);

  if (spikeBranch) {
    notes.push(`Spike branch active: ${spikeBranch}`);
  }

  if (pendingThinker) {
    notes.push('Resolution requires Thinker exploration before next patch.');
  }

  // Determine next state
  const nextState = planResult.requiresThinker || pendingThinker ? 'thinker' : 'implement';

  return {
    success: true,
    nextState,
    artifacts: {
      plan: planResult,
    },
    notes,
    requirePlanDelta: false, // Clear flag after successful plan
    requireThinker: planResult.requiresThinker || pendingThinker,
    spikeBranch,
    modelSelection: planResult.model,
  };
}
