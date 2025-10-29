/**
 * Plan State Runner
 *
 * Handles the "plan" state: creates implementation plan and determines if thinker is needed.
 *
 * Quality Graph Integration:
 * - Queries similar tasks before planning
 * - Provides hints from past similar tasks
 * - Non-blocking: planning works without hints
 * - Logs hints for observability
 */

import type { PlannerAgent } from '../planner_agent.js';
import type { LiveFlagsReader } from '../live_flags.js';

import type { RunnerContext, RunnerResult } from './runner_types.js';
import { getPlanningHints } from '../../quality_graph/hints.js';
import { logInfo, logWarning } from '../../telemetry/logger.js';

export interface PlanRunnerDeps {
  planner: PlannerAgent;
  workspaceRoot?: string; // For quality graph queries
  liveFlags?: LiveFlagsReader; // For feature flag checks
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
 * Quality Graph Integration:
 * - Queries similar tasks before planning (non-blocking)
 * - Logs hints for observability
 * - Attaches hints to plan result for future use
 *
 * @param context - Runner context with task and flags
 * @param deps - Dependencies (planner agent, workspace root)
 * @returns Result with nextState='thinker' or 'implement'
 */
export async function runPlan(
  context: PlanRunnerContext,
  deps: PlanRunnerDeps
): Promise<RunnerResult> {
  const { task, attemptNumber, modelSelection, requirePlanDelta, previousPlanHash, pendingThinker, spikeBranch } = context;

  // Query similar tasks from quality graph (non-blocking)
  let qualityGraphHints = '';
  let similarTasksCount = 0;

  if (deps.workspaceRoot) {
    // Check feature flag
    const hintsMode = deps.liveFlags?.getValue('QUALITY_GRAPH_HINTS_INJECTION') ?? 'observe';

    if (hintsMode === 'off') {
      logInfo('Quality graph hints disabled by feature flag', {
        taskId: task.id,
        flagValue: hintsMode
      });
    } else {
      try {
        logInfo('Querying quality graph for similar tasks', { taskId: task.id });

      qualityGraphHints = await getPlanningHints(
        deps.workspaceRoot,
        {
          title: task.title,
          description: task.description,
        },
        {
          k: 5,
          minSimilarity: 0.3,
          successOnly: false,
          excludeAbandoned: true,
        }
      );

      if (qualityGraphHints) {
        // Count similar tasks from hints
        const matches = qualityGraphHints.match(/###\s+\d+\./g);
        similarTasksCount = matches ? matches.length : 0;

        logInfo('Quality graph hints retrieved and stored', {
          taskId: task.id,
          similarTasksCount,
          hintsLength: qualityGraphHints.length,
          hintsStored: true,
        });
      } else {
        logInfo('No similar tasks found in quality graph', { taskId: task.id });
      }
      } catch (error) {
        // Graceful degradation: log warning but continue planning
        const errorMsg = error instanceof Error ? error.message : String(error);
        logWarning('Quality graph query failed (non-blocking)', {
          taskId: task.id,
          error: errorMsg,
        });
      }
    }
  }

  // Call planner to create implementation plan
  const planResult = await deps.planner.run({
    task,
    attempt: attemptNumber,
    requireDelta: requirePlanDelta ?? false,
    modelSelection, // Pass ComplexityRouter selection
    qualityGraphHints,  // Pass hints for storage in context pack
  });

  // If plan delta was required, verify hash changed
  if (requirePlanDelta && previousPlanHash && previousPlanHash === planResult.planHash) {
    throw new Error('Plan delta required but plan hash unchanged');
  }

  // Build notes
  const notes: string[] = [];
  notes.push(`Plan hash ${planResult.planHash.slice(0, 8)} recorded.`);

  if (similarTasksCount > 0) {
    notes.push(`Quality graph: Found ${similarTasksCount} similar task(s) for context.`);
  }

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
      plan: {
        ...planResult,
        qualityGraphHints, // Attach hints for future use
        similarTasksCount,
      },
    },
    notes,
    requirePlanDelta: false, // Clear flag after successful plan
    requireThinker: planResult.requiresThinker || pendingThinker,
    spikeBranch,
    modelSelection: planResult.model,
  };
}
