/**
 * Shared types for modular state runners
 *
 * This file defines common interfaces used by all state runners,
 * enabling consistent contracts and easier testing.
 */

import type { ModelSelection } from '../model_router.js';
import type { ResolutionResult } from '../resolution_engine.js';
import type { AutopilotState } from '../state_graph.js';
import type { TaskEnvelope } from '../task_envelope.js';

/**
 * Context passed to each runner
 *
 * Contains task information, current execution state, and model selection.
 */
export interface RunnerContext {
  task: TaskEnvelope;
  attemptNumber: number;
  modelSelection?: ModelSelection;
}

/**
 * Result returned by each runner
 *
 * Indicates success, next state, artifacts, and any requirements.
 */
export interface RunnerResult {
  success: boolean;
  nextState: AutopilotState | null;
  artifacts: Record<string, unknown>;
  notes: string[];
  requirePlanDelta?: boolean;
  requireThinker?: boolean;
  spikeBranch?: string;
  modelSelection?: ModelSelection;
}

/**
 * Retry limits per state
 *
 * IMPORTANT: These limits are enforced in StateGraph.
 * Exceeding a limit triggers incident reporter.
 */
export const RETRY_LIMITS: Record<AutopilotState, number> = {
  specify: 2,
  plan: 2,
  thinker: 1,
  implement: 3,
  verify: 2,
  review: 2,
  pr: 1,
  monitor: 1,
};

/**
 * Get retry limit for a state
 */
export function getRetryLimit(state: AutopilotState): number {
  return RETRY_LIMITS[state];
}

/**
 * Check if retry limit exceeded
 *
 * Returns true if attempt number exceeds the limit for this state.
 */
export function isRetryLimitExceeded(state: AutopilotState, attempt: number): boolean {
  return attempt > RETRY_LIMITS[state];
}
