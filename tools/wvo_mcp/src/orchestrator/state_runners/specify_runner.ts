/**
 * Specify State Runner
 *
 * Handles the "specify" state: defines acceptance criteria for the task.
 * This is the entry point of the state graph.
 */

import type { SupervisorAgent } from '../supervisor.js';
import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface SpecifyRunnerDeps {
  supervisor: SupervisorAgent;
}

/**
 * Run the specify state
 *
 * Calls supervisor to define acceptance criteria, then transitions to plan.
 *
 * @param context - Runner context with task and attempt number
 * @param deps - Dependencies (supervisor agent)
 * @returns Result with nextState='plan'
 */
export async function runSpecify(
  context: RunnerContext,
  deps: SpecifyRunnerDeps
): Promise<RunnerResult> {
  const { task } = context;

  // Call supervisor to specify acceptance criteria
  const specifyResult = deps.supervisor.specify(task);

  return {
    success: true,
    nextState: 'plan',
    artifacts: {
      specify: specifyResult,
    },
    notes: [`Acceptance criteria recorded: ${specifyResult.acceptanceCriteria.length}`],
    modelSelection: specifyResult.model,
  };
}
