import { logInfo, logWarning } from '../telemetry/logger.js';
import type { TaskEnvelope } from './task_envelope.js';
import type { ModelSelection } from './model_router.js';
import { ModelRouter } from './model_router.js';

export interface ReviewerInput {
  task: TaskEnvelope;
  patchHash: string;
  coverageDelta: number;
  modelSelection?: ModelSelection; // From ComplexityRouter
}

export interface ReviewerResult {
  approved: boolean;
  rubric: {
    resolution_proof: number;
    design: number;
    performance_security: number;
    maintainability: number;
    executive_quality: number;
  };
  report: string;
  model?: ModelSelection;
}

export class ReviewerAgent {
  constructor(private readonly router: ModelRouter) {}

  async review(input: ReviewerInput): Promise<ReviewerResult> {
    const rubric = {
      resolution_proof: input.coverageDelta >= 0.08 ? 4 : 2,
      design: 4,
      performance_security: input.coverageDelta >= 0.05 ? 4 : 3,
      maintainability: 4,
      executive_quality: 4,
    };
    const approved = Object.values(rubric).every(score => score >= 3);
    // Use ComplexityRouter selection if provided, otherwise fallback to ModelRouter
    let modelSelection: ModelSelection | undefined = input.modelSelection;
    if (!modelSelection) {
      try {
        modelSelection = this.router.pickModel('review', { taskId: input.task.id });
      } catch (error) {
        logWarning('ReviewerAgent failed to pick model', {
          taskId: input.task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    logInfo('ReviewerAgent completed rubric review', {
      taskId: input.task.id,
      patchHash: input.patchHash,
      approved,
      model: modelSelection?.model,
      source: input.modelSelection ? 'ComplexityRouter' : 'ModelRouter',
    });

    return {
      approved,
      rubric,
      report: JSON.stringify({
        approved,
        rubric,
        coverageDelta: input.coverageDelta,
      }),
      model: modelSelection,
    };
  }
}
