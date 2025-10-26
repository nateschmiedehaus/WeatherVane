/**
 * Monitor State Runner
 *
 * Handles the "monitor" state: runs smoke tests and finalizes task.
 * This is the final state - successful completion exits with nextState=null.
 */

import type { SupervisorAgent } from '../supervisor.js';
import type { RunnerContext, RunnerResult } from './runner_types.js';
import type { SmokeCommandResult } from '../smoke_command.js';

export interface MonitorRunnerDeps {
  supervisor: SupervisorAgent;
  runAppSmoke: (input: { taskId: string; attempt: number }) => Promise<SmokeCommandResult>;
  clearMemory: (taskId: string) => void;
  clearRouter: (taskId: string) => void;
}

/**
 * Run the monitor state
 *
 * Calls supervisor to monitor task and runs app smoke tests.
 * Returns to plan if smoke fails, otherwise completes task (nextState=null).
 *
 * @param context - Runner context with task
 * @param deps - Dependencies (supervisor, smoke test, cleanup callbacks)
 * @returns Result with nextState=null (success) or 'plan' (failure)
 */
export async function runMonitor(context: RunnerContext, deps: MonitorRunnerDeps): Promise<RunnerResult> {
  const { task } = context;

  // Call supervisor to monitor
  const monitorResult = deps.supervisor.monitor(task);

  // Run app smoke test
  const smoke = await deps.runAppSmoke({ taskId: task.id, attempt: context.attemptNumber });

  // If smoke test fails, require plan delta and return to plan
  if (!smoke.success) {
    return {
      success: false,
      nextState: 'plan',
      artifacts: { monitor: { ...monitorResult, smoke } },
      notes: ['App smoke failed; forcing plan delta.'],
      requirePlanDelta: true,
      modelSelection: monitorResult.model,
    };
  }

  // Smoke test passed - clear task and complete
  deps.clearMemory(task.id);
  deps.clearRouter(task.id);

  return {
    success: true,
    nextState: null, // Task complete
    artifacts: { monitor: { ...monitorResult, smoke } },
    notes: ['Monitor succeeded, task complete.'],
    modelSelection: monitorResult.model,
  };
}
