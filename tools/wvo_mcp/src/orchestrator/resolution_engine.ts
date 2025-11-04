import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logInfo, logWarning } from '../telemetry/logger.js';

import {
  BlockerLabel,
  FailureSignals,
  classifyBlocker,
  getResolutionCeiling,
  logBlocker,
  requiresThinker,
  shouldSpike,
  deriveSpikeBranch,
  describeEvidenceExpectation,
  getBlockerProfile,
} from './blocker_taxonomy.js';
import type { VerifierResult } from './verifier.js';
import type { IntegrityReport } from './verify_integrity.js';

export interface ResolutionStep {
  cause_hypothesis: string;
  step_actions: string[];
  expected_signal: string;
  evidence_required: string[];
  next_state: 'Plan' | 'Implement' | 'Verify' | 'Review';
  ceilings?: { attempts?: number };
}

export interface ResolutionResult {
  label: BlockerLabel;
  steps: ResolutionStep[];
  planDelta: string;
  actionables: { file?: string; change: string; test?: string }[];
  requiresThinker: boolean;
  spikeBranch?: string;
  artifactPath?: string;
}

export interface ResolutionContext {
  taskId: string;
  runId: string;
  workspaceRoot: string;
  verifier: VerifierResult;
  integrity?: IntegrityReport;
  failingGate?: string;
  logSnippets?: string[];
}

const RESOLUTION_RESOURCE_PREFIX = 'resources://runs';

export function classifyFailure(ctx: ResolutionContext): BlockerLabel {
  const signals: FailureSignals = {
    taskId: ctx.taskId,
    gate: ctx.failingGate,
    errorText: ctx.logSnippets?.join('\n'),
    coverageDelta: ctx.verifier.coverageDelta,
    coverageTarget: ctx.verifier.coverageTarget,
    logs: ctx.logSnippets,
    integrity: ctx.integrity
      ? {
          placeholdersFound: ctx.integrity.placeholdersFound,
          skippedTestsFound: ctx.integrity.skippedTestsFound,
          noOpSuspicion: ctx.integrity.noOpSuspicion,
        }
      : undefined,
  };
  const label = classifyBlocker(signals);
  logBlocker(label, signals);
  return label;
}

export function buildPlaybook(label: BlockerLabel): ResolutionStep[] {
  switch (label) {
    case 'missing_dependency':
      return [
        {
          cause_hypothesis: 'Dependency or provider not installed in CI.',
          step_actions: ['Replicate install locally', 'Add lock/dependency file updates', 'Record CI run installing dependency'],
          expected_signal: 'CI log shows dependency install + green tests',
          evidence_required: ['Screenshot/log snippet of failing install', 'Link to passing run after install'],
          next_state: 'Plan',
          ceilings: { attempts: 2 },
        },
        {
          cause_hypothesis: 'Provider requires mock/stub for hermetic runs.',
          step_actions: ['Add lightweight stub/provider with deterministic responses', 'Guard behind feature toggle'],
          expected_signal: 'Tests run without hitting live provider.',
          evidence_required: ['Stub file path', 'Link to failing test now green via stub'],
          next_state: 'Implement',
        },
      ];
    case 'underspecified_requirements':
      return [
        {
          cause_hypothesis: 'Acceptance criteria incomplete.',
          step_actions: ['Author new acceptance tests capturing missing behavior', 'Update product spec / README'],
          expected_signal: 'New failing test that demonstrates bug/regression then passes after fix.',
          evidence_required: ['Test file diff', 'Link to failing run using new test'],
          next_state: 'Plan',
        },
        {
          cause_hypothesis: 'Knowledge base missing scenario details.',
          step_actions: ['Update KB resource with scenario', 'Pin resource in planner memory'],
          expected_signal: 'Planner context pack references new KB entry.',
          evidence_required: ['KB resource path'],
          next_state: 'Plan',
        },
      ];
    case 'external_secret_or_credential':
      return [
        {
          cause_hypothesis: 'Live secret required but unavailable in CI.',
          step_actions: ['Generate stub provider in repo', 'Document real secret request via policy.require_human'],
          expected_signal: 'CI uses stub + policy hook raised for human provisioning.',
          evidence_required: ['Stub path', 'policy.require_human reference'],
          next_state: 'Implement',
        },
      ];
    case 'integration_contract_break':
      return [
        {
          cause_hypothesis: 'Adapter schema drifted.',
          step_actions: ['Add contract tests for adapter', 'Update schema + fixtures'],
          expected_signal: 'Contract tests fail before fix and pass after.',
          evidence_required: ['Test path and fixture diff', 'Link to failing contract test run'],
          next_state: 'Plan',
        },
      ];
    case 'flaky_test':
      return [
        {
          cause_hypothesis: 'Test nondeterministic under load.',
          step_actions: ['Add N-run detector', 'Stabilize randomness/seed', 'Document quarantine plan'],
          expected_signal: 'Detector shows stable results post-fix.',
          evidence_required: ['Detector log', 'Seed strategy notes'],
          next_state: 'Verify',
        },
      ];
    case 'non_determinism':
      return [
        {
          cause_hypothesis: 'Shared state or randomness causing diverging results.',
          step_actions: ['Identify shared mutable state', 'Add guard rails or deterministic seed'],
          expected_signal: 'Re-run passes twice consecutively.',
          evidence_required: ['Before/after diff referencing deterministic change'],
          next_state: 'Implement',
        },
      ];
    case 'performance_regression':
      return [
        {
          cause_hypothesis: 'Budget exceeded after change.',
          step_actions: ['Add perf benchmark around affected code', 'Optimize critical path', 'Document budget'],
          expected_signal: 'Benchmark shows latency within budget.',
          evidence_required: ['Benchmark script output', 'Perf budget doc update'],
          next_state: 'Verify',
        },
      ];
    case 'lint_type_security_blocker':
      return [
        {
          cause_hypothesis: 'Lint/security rule triggered.',
          step_actions: ['Target offending rule', 'Add fix with justification', 'Avoid suppressions unless linked to issue'],
          expected_signal: 'Lint/security scans pass without new suppressions.',
          evidence_required: ['Lint log snippet', 'Fix diff'],
          next_state: 'Implement',
        },
      ];
    default:
      return [
        {
          cause_hypothesis: 'Uncategorized failure.',
          step_actions: ['Reproduce failure locally', 'Add logging/telemetry', 'Document reproduction steps in MRFC'],
          expected_signal: 'Reproduction script available.',
          evidence_required: ['Repro script path'],
          next_state: 'Plan',
        },
      ];
  }
}

export async function runResolution(ctx: ResolutionContext): Promise<ResolutionResult> {
  const label = classifyFailure(ctx);
  const profile = getBlockerProfile(label);
  const steps = buildPlaybook(label).map((step) => ({
    ...step,
    ceilings: step.ceilings ?? { attempts: getResolutionCeiling(label).attempts },
  }));
  const planDelta = [
    `Resolution label: ${label}`,
    `Focus: ${steps[0]?.cause_hypothesis ?? 'investigate root cause'}`,
    describeEvidenceExpectation(label),
  ].join('\n');
  const actionables = steps.map((step) => ({
    change: step.step_actions.join(' ➜ '),
    file: inferDefaultFile(step, label),
    test: inferDefaultTest(step, label),
  }));

  const result: ResolutionResult = {
    label,
    steps,
    planDelta,
    actionables,
    requiresThinker: requiresThinker(label),
  };

  if (shouldSpike(label)) {
    result.spikeBranch = deriveSpikeBranch(ctx.taskId, label);
  }

  await appendJournal(ctx, result);
  const artifactPath = await writeResolutionArtifact(ctx, result);
  if (artifactPath) {
    result.artifactPath = artifactPath;
  }
  return result;
}

async function appendJournal(ctx: ResolutionContext, result: ResolutionResult): Promise<void> {
  const journalDir = path.join(ctx.workspaceRoot, 'resources', 'runs', ctx.runId);
  const journalPath = path.join(journalDir, 'journal.md');
  await fs.mkdir(journalDir, { recursive: true });
  const entry = [
    `## Resolution ${new Date().toISOString()}`,
    `Task: ${ctx.taskId}`,
    `Label: ${result.label}`,
    `Plan Delta:\n${result.planDelta}`,
    `Actionables:\n${result.actionables.map((a) => `- ${a.change}${a.file ? ` (${a.file})` : ''}`).join('\n')}`,
    '',
  ].join('\n');
  await fs.appendFile(journalPath, `${entry}\n`);
  logInfo('Resolution engine journaled entry', {
    taskId: ctx.taskId,
    runId: ctx.runId,
    label: result.label,
  });
}

function inferDefaultFile(step: ResolutionStep, label: BlockerLabel): string | undefined {
  if (label === 'external_secret_or_credential') {
    return 'shared/stubs/providers';
  }
  if (label === 'integration_contract_break') {
    return 'tests/contracts';
  }
  if (step.step_actions.some((action) => action.includes('benchmark'))) {
    return 'tests/perf';
  }
  return undefined;
}

function inferDefaultTest(step: ResolutionStep, label: BlockerLabel): string | undefined {
  if (label === 'underspecified_requirements') {
    return 'tests/e2e/new_acceptance.test.ts';
  }
  if (label === 'flaky_test' || label === 'non_determinism') {
    return 'tests/tools/flaky_detector.py';
  }
  return undefined;
}

async function writeResolutionArtifact(ctx: ResolutionContext, result: ResolutionResult): Promise<string | undefined> {
  try {
    const resolutionDir = path.join(ctx.workspaceRoot, 'resources', 'runs', ctx.runId, 'resolution');
    await fs.mkdir(resolutionDir, { recursive: true });
    const filename = sanitizeFileName(`${ctx.taskId}-${Date.now()}.json`);
    const filePath = path.join(resolutionDir, filename);
    const payload = {
      taskId: ctx.taskId,
      failingGate: ctx.failingGate ?? 'unknown',
      label: result.label,
      planDelta: result.planDelta,
      actionables: result.actionables,
      requiresThinker: result.requiresThinker,
      spikeBranch: result.spikeBranch,
      steps: result.steps,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
    return `${RESOLUTION_RESOURCE_PREFIX}/${ctx.runId}/resolution/${filename}`;
  } catch (error) {
    logWarning('Resolution engine failed to write artifact', {
      taskId: ctx.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function sanitizeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}
