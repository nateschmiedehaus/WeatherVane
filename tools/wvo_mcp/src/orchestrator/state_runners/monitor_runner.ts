/**
 * Monitor State Runner
 *
 * Handles the "monitor" state: runs smoke tests and finalizes task.
 * This is the final state - successful completion exits with nextState=null.
 *
 * Quality Graph Integration:
 * - Records task vector after successful smoke test
 * - Non-blocking: recording failures don't fail the task
 * - Graceful degradation: logs warnings on recording errors
 */

import type { SmokeCommandResult } from '../smoke_command.js';
import type { SupervisorAgent } from '../supervisor.js';

import type { RunnerContext, RunnerResult } from './runner_types.js';
import { recordTaskVector, extractRecordingMetadata } from '../../quality_graph/recorder.js';
import { getCorpusSize } from '../../quality_graph/corpus_metrics.js';
import { logInfo, logWarning } from '../../telemetry/logger.js';

export interface MonitorRunnerDeps {
  supervisor: SupervisorAgent;
  runAppSmoke: (input: { taskId: string; attempt: number }) => Promise<SmokeCommandResult>;
  clearMemory: (taskId: string) => void;
  clearRouter: (taskId: string) => void;
  workspaceRoot: string; // For quality graph recording
  artifacts?: Record<string, unknown>; // For extracting metadata
  startTime?: number; // For computing duration
}

/**
 * Run the monitor state
 *
 * Calls supervisor to monitor task and runs app smoke tests.
 * Records task vector to quality graph after successful smoke test.
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

  // Smoke test passed - record task vector to quality graph
  // This is non-blocking: failures log warnings but don't fail the task
  const recordingNotes: string[] = [];
  try {
    // Compute duration if startTime provided
    const durationMs =
      deps.startTime !== undefined ? performance.now() - deps.startTime : undefined;

    // Extract metadata from task and artifacts
    const metadata = extractRecordingMetadata(
      {
        id: task.id,
        title: task.title,
        description: task.description,
      },
      deps.artifacts ?? {},
      durationMs
    );

    logInfo('Recording task vector to quality graph', { taskId: task.id });

    const recordingResult = await recordTaskVector(deps.workspaceRoot, metadata);

    if (recordingResult.success) {
      recordingNotes.push('Task vector recorded to quality graph.');
    } else {
      logWarning('Quality graph recording failed (non-blocking)', {
        taskId: task.id,
        error: recordingResult.error,
      });
      recordingNotes.push(`Quality graph recording failed: ${recordingResult.error}`);
    }
  } catch (error) {
    // Graceful degradation: log error but don't fail task
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWarning('Quality graph recording error (non-blocking)', {
      taskId: task.id,
      error: errorMsg,
    });
    recordingNotes.push(`Quality graph recording error: ${errorMsg}`);
  }

  // Emit corpus size metric (non-blocking)
  try {
    const corpusSize = await getCorpusSize(deps.workspaceRoot);
    logInfo('Quality graph corpus size', { corpusSize, taskId: task.id });
  } catch (error) {
    // Graceful degradation: log warning but don't fail task
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWarning('Failed to get quality graph corpus size (non-blocking)', {
      taskId: task.id,
      error: errorMsg,
    });
  }

  // Clear task and complete
  deps.clearMemory(task.id);
  deps.clearRouter(task.id);

  return {
    success: true,
    nextState: null, // Task complete
    artifacts: { monitor: { ...monitorResult, smoke } },
    notes: ['Monitor succeeded, task complete.', ...recordingNotes],
    modelSelection: monitorResult.model,
  };
}
