import { parseArgs } from 'node:util';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  PromptAttestationManager,
  type PromptAttestation,
} from '../src/orchestrator/prompt_attestation.js';
import type { WorkPhase } from '../src/orchestrator/work_process_enforcer.js';
import { logError, logInfo } from '../src/telemetry/logger.js';

const VALID_WORK_PHASES: ReadonlyArray<WorkPhase> = [
  'STRATEGIZE',
  'SPEC',
  'PLAN',
  'THINK',
  'IMPLEMENT',
  'VERIFY',
  'REVIEW',
  'PR',
  'MONITOR',
];

interface CliOptions {
  task: string | undefined;
  phase: WorkPhase | undefined;
  hash: string | undefined;
  useLatest: boolean;
  reason: string | undefined;
  versionTag: string | undefined;
  updatedBy: string | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceRoot =
  process.env.WVO_WORKSPACE_ROOT ??
  path.resolve(__dirname, '..', '..', '..', '..');

function parseCliOptions(): CliOptions {
  const { values } = parseArgs({
    options: {
      task: { type: 'string', short: 't' },
      phase: { type: 'string', short: 'p' },
      hash: { type: 'string', short: 'H' },
      'use-latest': { type: 'boolean', default: false },
      reason: { type: 'string', short: 'r' },
      'version-tag': { type: 'string', short: 'V' },
      'updated-by': { type: 'string', short: 'u' },
    },
    allowPositionals: false,
  });

  const phase = values.phase?.toUpperCase() as WorkPhase | undefined;
  if (phase && !VALID_WORK_PHASES.includes(phase)) {
    throw new Error(
      `Invalid phase "${values.phase}". Expected one of: ${VALID_WORK_PHASES.join(
        ', ',
      )}`,
    );
  }

  return {
    task: values.task,
    phase,
    hash: values.hash,
    useLatest: Boolean(values['use-latest']),
    reason: values.reason,
    versionTag: values['version-tag'],
    updatedBy: values['updated-by'],
  };
}

async function resolveLatestHash(
  manager: PromptAttestationManager,
  taskId: string,
  phase: WorkPhase,
): Promise<string> {
  const history = await manager.getAttestationHistory(taskId);
  const phaseHistory = history
    .filter((entry) => entry.phase === phase)
    .sort((a, b) => {
      const aTime = Date.parse(a.timestamp);
      const bTime = Date.parse(b.timestamp);
      return aTime - bTime;
    });

  const latest: PromptAttestation | undefined = phaseHistory.at(-1);
  if (!latest) {
    throw new Error(
      `No attestation history found for task "${taskId}" in phase "${phase}". Run the phase cycle at least once before adopting a baseline.`,
    );
  }

  if (!latest.prompt_hash) {
    throw new Error(
      `Latest attestation for task "${taskId}" phase "${phase}" is missing prompt hash.`,
    );
  }

  return latest.prompt_hash;
}

function ensureBaselineHash(options: CliOptions): string {
  if (options.hash && options.useLatest) {
    throw new Error('Provide either --hash or --use-latest, not both.');
  }
  if (!options.hash && !options.useLatest) {
    throw new Error(
      'Specify a new baseline via --hash <value> or --use-latest to adopt the most recent attestation hash.',
    );
  }
  return options.hash ?? '';
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  if (!options.task) {
    throw new Error('Task id is required (--task <TASK-ID>).');
  }
  if (!options.phase) {
    throw new Error('Phase is required (--phase <WORK-PHASE>).');
  }

  const explicitHash = ensureBaselineHash(options);

  const manager = new PromptAttestationManager(workspaceRoot);
  await manager.initialize();

  const baselineHash = options.useLatest
    ? await resolveLatestHash(manager, options.task, options.phase)
    : explicitHash;

  const updatedBy =
    options.updatedBy ??
    process.env.GIT_AUTHOR_NAME ??
    process.env.USER ??
    'unknown';

  await manager.resetBaseline(options.task, options.phase, baselineHash, {
    updatedBy,
    reason: options.reason,
    versionTag: options.versionTag,
  });

  logInfo('Prompt baseline updated', {
    taskId: options.task,
    phase: options.phase,
    baselineHash: baselineHash.slice(0, 16),
    updatedBy,
    reason: options.reason,
    versionTag: options.versionTag,
  });

  // Provide human-readable confirmation for CLI consumers
  console.log(
    [
      '✅ Prompt baseline updated',
      `  task: ${options.task}`,
      `  phase: ${options.phase}`,
      `  hash: ${baselineHash}`,
      `  updatedBy: ${updatedBy}`,
      options.reason ? `  reason: ${options.reason}` : undefined,
      options.versionTag ? `  versionTag: ${options.versionTag}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  logError('Prompt baseline update failed', { error: message });
  console.error(`❌ ${message}`);
  process.exitCode = 1;
});
