import crypto from 'node:crypto';
import { logDebug, logInfo, logWarning } from '../telemetry/logger.js';
import type { TaskEnvelope } from './task_envelope.js';
import type { ModelSelection } from './model_router.js';
import { ModelRouter } from './model_router.js';
import { RunEphemeralMemory } from '../memory/run_ephemeral.js';
import { KnowledgeBaseResources } from '../memory/kb_resources.js';
import { ProjectIndex } from '../memory/project_index.js';

export interface PlannerAgentConfig {
  maxContextFiles?: number;
}

export interface PlannerAgentInput {
  task: TaskEnvelope;
  attempt: number;
  requireDelta: boolean;
  modelSelection?: ModelSelection; // From ComplexityRouter
}

export interface PlannerAgentResult {
  planHash: string;
  requiresThinker: boolean;
  summary: string;
  planDeltaToken: string;
  model?: ModelSelection;
  coverageTarget: number;
}

interface PlannerAgentDeps {
  router: ModelRouter;
  memory: RunEphemeralMemory;
  kb: KnowledgeBaseResources;
  projectIndex: ProjectIndex;
}

export class PlannerAgent {
  constructor(
    private readonly deps: PlannerAgentDeps,
    private readonly config: PlannerAgentConfig = {}
  ) {}

  async run(input: PlannerAgentInput): Promise<PlannerAgentResult> {
    const base = JSON.stringify({
      id: input.task.id,
      title: input.task.title ?? '',
      labels: input.task.labels ?? [],
      files: this.resolveFileHints(input.task),
      priorityTags: input.task.priorityTags ?? [],
    });
    const planHash = crypto.createHash('sha1').update(base).digest('hex');
    const planDeltaToken = crypto.createHash('sha1').update(`${planHash}:${Date.now()}`).digest('hex');

    logDebug('PlannerAgent produced plan', {
      taskId: input.task.id,
      attempt: input.attempt,
      planHash,
      requireDelta: input.requireDelta,
    });

    // Use ComplexityRouter selection if provided, otherwise fallback to ModelRouter
    const modelSelection = input.modelSelection ?? this.safePickModel(input.task.id);
    if (modelSelection) {
      logInfo('PlannerAgent model selection', {
        taskId: input.task.id,
        model: modelSelection.model,
        provider: modelSelection.provider,
        source: input.modelSelection ? 'ComplexityRouter' : 'ModelRouter',
      });
    }

    await this.deps.projectIndex.refresh(this.resolveFileHints(input.task));
    const indexSnapshot = this.deps.projectIndex.snapshot();
    const kbPack = await this.deps.kb.listPinned();
    const coverageTarget = this.resolveCoverageTarget();
    const contextPack = {
      planHash,
      kb: kbPack,
      index: indexSnapshot,
      summary: `Context pack for ${input.task.id}`,
      coverageTarget,
    };
    this.deps.memory.set(input.task.id, 'planner', 'context_pack', contextPack);

    const requiresThinker =
      input.requireDelta ||
      (input.task.priorityTags ?? []).some(tag => ['p0', 'critical'].includes(tag.toLowerCase()));

    return {
      planHash,
      requiresThinker,
      summary: `Plan ${planHash.slice(0, 8)} covering ${this.config.maxContextFiles ?? 12} files.`,
      planDeltaToken,
      model: modelSelection,
      coverageTarget,
    };
  }

  private safePickModel(taskId: string): ModelSelection | undefined {
    try {
      return this.deps.router.pickModel('plan', { taskId });
    } catch (error) {
      logWarning('PlannerAgent failed to pick model', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private resolveFileHints(task: TaskEnvelope): string[] {
    const files = task.metadata?.files as unknown;
    if (Array.isArray(files)) {
      return files.filter((value): value is string => typeof value === 'string');
    }
    return [];
  }

  private resolveCoverageTarget(): number {
    const raw = process.env.WVO_COVERAGE_MIN_DELTA ?? '0.05';
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0.05;
    }
    return Math.min(0.5, Math.max(0.01, parsed));
  }
}
