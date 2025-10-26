/**
 * Thinker State Runner
 *
 * Handles the "thinker" state: explores ambiguities and provides insights before implementation.
 */

import type { ThinkerAgent } from '../thinker_agent.js';
import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface ThinkerRunnerDeps {
  thinker: ThinkerAgent;
}

export interface ThinkerRunnerContext extends RunnerContext {
  planHash: string;
}

/**
 * Run the thinker state
 *
 * Calls thinker to explore ambiguities and generate insights,
 * then transitions to implement.
 *
 * @param context - Runner context with task and plan hash
 * @param deps - Dependencies (thinker agent)
 * @returns Result with nextState='implement'
 */
export async function runThinker(
  context: ThinkerRunnerContext,
  deps: ThinkerRunnerDeps
): Promise<RunnerResult> {
  const { task, modelSelection, planHash } = context;

  if (!planHash) {
    throw new Error('Thinker requires plan hash from previous plan state');
  }

  // Call thinker to explore ambiguities
  const reflection = await deps.thinker.reflect({
    task,
    planHash,
    modelSelection, // Pass ComplexityRouter selection
  });

  return {
    success: true,
    nextState: 'implement',
    artifacts: {
      thinker: reflection,
    },
    notes: [`Thinker added ${reflection.insights.length} insights.`],
    modelSelection: reflection.model,
  };
}
