/**
 * PR State Runner
 *
 * Handles the "pr" state: prepares PR checklist and validates readiness.
 */

import type { SupervisorAgent } from '../supervisor.js';

import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface PrRunnerDeps {
  supervisor: SupervisorAgent;
}

/**
 * Run the pr state
 *
 * Calls supervisor to prepare PR checklist and validate readiness.
 * Returns to plan if not ready, otherwise proceeds to monitor.
 *
 * @param context - Runner context with task
 * @param deps - Dependencies (supervisor agent)
 * @returns Result with nextState='monitor' or 'plan'
 */
export async function runPr(context: RunnerContext, deps: PrRunnerDeps): Promise<RunnerResult> {
  const { task } = context;

  // Call supervisor to prepare PR checklist
  const prResult = deps.supervisor.preparePr(task);

  // Check if PR is ready
  if (!prResult.ready) {
    return {
      success: false,
      nextState: 'plan',
      artifacts: { pr: prResult },
      notes: ['PR checklist failed.'],
      requirePlanDelta: true,
      modelSelection: prResult.model,
    };
  }

  // PR ready - proceed to monitor
  return {
    success: true,
    nextState: 'monitor',
    artifacts: { pr: prResult },
    notes: ['PR checklist satisfied.'],
    modelSelection: prResult.model,
  };
}
