import crypto from 'node:crypto';

import { RunEphemeralMemory } from '../memory/run_ephemeral.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

import type { ModelSelection } from './model_router.js';
import { ModelRouter } from './model_router.js';
import type { TaskEnvelope } from './task_envelope.js';
import type { ChangedFile } from './verify_integrity.js';

export interface ImplementerAgentInput {
  task: TaskEnvelope;
  planHash: string;
  insights?: string[];
  modelSelection?: ModelSelection; // From ComplexityRouter
}

export interface ImplementerAgentResult {
  success: boolean;
  patchHash: string;
  notes: string[];
  coverageHint: number;
  model?: ModelSelection;
  changedFiles: ChangedFile[];
  changedLinesCoverage: number;
  touchedFilesDelta: number;
  failingProofProvided?: boolean;
  mutationSmokeEnabled?: boolean;
  contextPackResource?: string;
}

interface ImplementerAgentDeps {
  router: ModelRouter;
  memory: RunEphemeralMemory;
}

export class ImplementerAgent {
  constructor(private readonly deps: ImplementerAgentDeps) {}

  async apply(input: ImplementerAgentInput): Promise<ImplementerAgentResult> {
    const patchHash = crypto
      .createHash('sha1')
      .update([input.task.id, input.planHash, ...(input.insights ?? [])].join(':'))
      .digest('hex');

    const contextPack = this.deps.memory.get<Record<string, unknown>>(input.task.id, 'planner', 'context_pack');
    const contextPackUri = this.deps.memory.get<string>(input.task.id, 'planner', 'context_pack_uri');

    // Use ComplexityRouter selection if provided, otherwise fallback to ModelRouter
    let modelSelection: ModelSelection | undefined = input.modelSelection;
    if (!modelSelection) {
      try {
        modelSelection = this.deps.router.pickModel('implement', { taskId: input.task.id });
      } catch (error) {
        logWarning('ImplementerAgent failed to pick model', {
          taskId: input.task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logInfo('ImplementerAgent emitted patch', {
      taskId: input.task.id,
      planHash: input.planHash,
      patchHash,
      insights: input.insights?.length ?? 0,
      model: modelSelection?.model,
      source: input.modelSelection ? 'ComplexityRouter' : 'ModelRouter',
    });

    const changedFiles = this.synthesizeChangedFiles(input.task, patchHash);
    const touchedFilesDelta = Math.min(0.5, changedFiles.length * 0.1 || 0.1);
    const coverageHint = 0.08 + changedFiles.length * 0.01;

    const failingProofProvided = Boolean(
      input.task.metadata && (input.task.metadata as Record<string, unknown>).failing_proof
    );

    const notes = [
      `Patch ${patchHash.slice(0, 8)} ready`,
      contextPack ? 'Planner context pack cached.' : 'No planner context pack found.',
    ];
    if (contextPackUri) {
      notes.push(`Context pack: ${contextPackUri}`);
    }

    this.recordImplementerMemory(input.task.id, {
      patchHash,
      planHash: input.planHash,
      changedFiles,
      coverageHint,
      touchedFilesDelta,
      failingProofProvided,
    });

    return {
      success: true,
      patchHash,
      notes,
      coverageHint,
      model: modelSelection,
      changedFiles,
      changedLinesCoverage: Math.min(0.95, coverageHint + 0.05),
      touchedFilesDelta,
      failingProofProvided,
      mutationSmokeEnabled: true,
      contextPackResource: contextPackUri,
    };
  }

  private synthesizeChangedFiles(task: TaskEnvelope, patchHash: string): ChangedFile[] {
    const hints = this.resolveFileHints(task);
    if (hints.length === 0) {
      return [
        {
          path: `autopilot/${patchHash.slice(0, 8)}.ts`,
          patch: `+// autopilot change ${patchHash}\n+export const token = '${patchHash.slice(0, 6)}';\n`,
        },
      ];
    }
    return hints.slice(0, 4).map((file, index) => ({
      path: file,
      patch: `+// patch ${patchHash}-${index}\n+console.log('autopilot patch ${index}');\n`,
      isTestFile: /test|spec/i.test(file),
      isConfigFile: /config|\.ya?ml$|\.json$/i.test(file),
    }));
  }

  private resolveFileHints(task: TaskEnvelope): string[] {
    const files = task.metadata?.files;
    if (Array.isArray(files)) {
      return files.filter((value): value is string => typeof value === 'string');
    }
    return [];
  }

  private recordImplementerMemory(
    taskId: string,
    payload: {
      patchHash: string;
      planHash: string;
      changedFiles: ChangedFile[];
      coverageHint: number;
      touchedFilesDelta: number;
      failingProofProvided: boolean;
    }
  ): void {
    this.deps.memory.set(taskId, 'implementer', 'patch_hash', payload.patchHash);
    this.deps.memory.set(taskId, 'implementer', 'plan_hash', payload.planHash);
    this.deps.memory.set(taskId, 'implementer', 'changed_files', payload.changedFiles);
    this.deps.memory.set(taskId, 'implementer', 'coverage_hint', payload.coverageHint);
    this.deps.memory.set(taskId, 'implementer', 'touched_files_delta', payload.touchedFilesDelta);
    this.deps.memory.set(taskId, 'implementer', 'failing_proof', payload.failingProofProvided);
  }
}
