import { logInfo, logWarning } from '../telemetry/logger.js';

import type { ModelSelection } from './model_router.js';
import { ModelRouter } from './model_router.js';
import type { TaskEnvelope } from './task_envelope.js';

export interface ThinkerAgentInput {
  task: TaskEnvelope;
  planHash: string;
  modelSelection?: ModelSelection; // From ComplexityRouter
}

export interface ThinkerAgentResult {
  insights: string[];
  escalationRecommended: boolean;
  model?: ModelSelection;
}

export class ThinkerAgent {
  constructor(private readonly router: ModelRouter) {}

  async reflect(input: ThinkerAgentInput): Promise<ThinkerAgentResult> {
    const insights = [
      `Confirm dependencies for ${input.task.title}`,
      `Stress-test plan ${input.planHash.slice(0, 8)}`,
    ];
    // Use ComplexityRouter selection if provided, otherwise fallback to ModelRouter
    const model = input.modelSelection ?? this.safePickModel(input.task.id);
    logInfo('ThinkerAgent produced insights', {
      taskId: input.task.id,
      insightCount: insights.length,
      model: model?.model,
      source: input.modelSelection ? 'ComplexityRouter' : 'ModelRouter',
    });
    return {
      insights,
      escalationRecommended: input.task.priorityTags?.includes('p0') ?? false,
      model,
    };
  }

  private safePickModel(taskId: string): ModelSelection | undefined {
    try {
      return this.router.pickModel('thinker', { taskId });
    } catch (error) {
      logWarning('ThinkerAgent failed to pick model', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}
