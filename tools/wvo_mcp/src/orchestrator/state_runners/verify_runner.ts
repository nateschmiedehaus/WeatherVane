/**
 * Verify State Runner
 *
 * Handles the "verify" state: runs quality gates, checks integrity, and triggers resolution if needed.
 * This is the most complex runner due to multiple validation paths.
 */

import type { Verifier, VerifierResult } from '../verifier.js';
import type { IntegrityReport, ChangedFile } from '../verify_integrity.js';
import { runResolution, type ResolutionResult } from '../resolution_engine.js';
import type { RunnerContext, RunnerResult } from './runner_types.js';

export interface VerifyRunnerDeps {
  verifier: Verifier;
  noteVerifyFailure: (taskId: string) => void;
  clearTask: (taskId: string) => void;
}

export interface VerifyRunnerContext extends RunnerContext {
  patchHash: string;
  coverageHint: number;
  coverageTarget?: number;
  changedFiles: ChangedFile[];
  changedLinesCoverage: number;
  touchedFilesDelta: number;
  failingProofProvided: boolean;
  mutationSmokeEnabled: boolean;
  workspaceRoot: string;
  runId: string;
}

/**
 * Run the verify state
 *
 * Calls verifier to run quality gates, checks integrity, and triggers resolution if needed.
 * Returns to plan if verification fails, or proceeds to review if successful.
 *
 * @param context - Runner context with implementation details
 * @param deps - Dependencies (verifier and router callbacks)
 * @returns Result with nextState='review' or 'plan'
 */
export async function runVerify(
  context: VerifyRunnerContext,
  deps: VerifyRunnerDeps
): Promise<RunnerResult> {
  const {
    task,
    patchHash,
    coverageHint,
    coverageTarget,
    changedFiles,
    changedLinesCoverage,
    touchedFilesDelta,
    failingProofProvided,
    mutationSmokeEnabled,
    workspaceRoot,
    runId,
  } = context;

  if (!patchHash) {
    throw new Error('Verify requires patch hash from previous implement state');
  }

  // Get coverage target (from plan or verifier default)
  const actualCoverageTarget = coverageTarget ?? deps.verifier.getCoverageThreshold();

  // Call verifier to run quality gates
  const verifierResult = await deps.verifier.verify({
    task,
    patchHash,
    coverageHint,
    coverageTarget: actualCoverageTarget,
    changedFiles,
    changedLinesCoverage,
    touchedFilesDelta,
    failingProofProvided,
    mutationSmokeEnabled,
  });

  // Extract integrity report if present
  const integrityReport = verifierResult.artifacts.integrity as IntegrityReport | undefined;

  // Check for integrity violations
  const integrityViolation = integrityReport
    ? !integrityReport.changedLinesCoverageOk ||
      integrityReport.skippedTestsFound.length > 0 ||
      integrityReport.placeholdersFound.length > 0 ||
      integrityReport.noOpSuspicion.length > 0 ||
      integrityReport.mutationSmokeOk === false
    : false;

  // Build artifacts
  const artifacts: Record<string, unknown> = {
    verify: verifierResult,
  };
  if (integrityReport) {
    artifacts.integrity = integrityReport;
  }

  // If verification failed or integrity violation, trigger resolution
  if (!verifierResult.success || integrityViolation) {
    // Note failure with router
    deps.noteVerifyFailure(task.id);

    // Determine failing gate
    const failingGate = !verifierResult.success
      ? verifierResult.gateResults.find((gate) => !gate.success)?.name ??
        (verifierResult.coverageDelta < verifierResult.coverageTarget ? 'coverage_delta' : 'unknown')
      : 'integrity_guard';

    // Run resolution engine
    const resolution = await runResolution({
      taskId: task.id,
      runId,
      workspaceRoot,
      verifier: verifierResult,
      integrity: integrityReport,
      failingGate,
      logSnippets: verifierResult.gateResults.map((gate) => `${gate.name}: ${gate.output}`),
    });

    artifacts.resolution = resolution;

    const notes: string[] = [`Resolution triggered (${resolution.label}); plan delta required.`];
    if (resolution.spikeBranch) {
      notes.push(`Spike branch created: ${resolution.spikeBranch}`);
    }

    return {
      success: false,
      nextState: 'plan',
      artifacts,
      notes,
      requirePlanDelta: true,
      requireThinker: resolution.requiresThinker,
      spikeBranch: resolution.spikeBranch,
    };
  }

  // Verification succeeded - clear task from router and proceed to review
  deps.clearTask(task.id);

  return {
    success: true,
    nextState: 'review',
    artifacts,
    notes: [
      `Verification succeeded with coverage ${verifierResult.coverageDelta.toFixed(3)} (target ${verifierResult.coverageTarget}).`,
    ],
  };
}
