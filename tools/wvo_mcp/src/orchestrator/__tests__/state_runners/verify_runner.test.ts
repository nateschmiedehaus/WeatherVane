/**
 * Verify Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { runResolution, type ResolutionResult } from '../../resolution_engine.js';
import { runVerify, type VerifyRunnerDeps, type VerifyRunnerContext } from '../../state_runners/verify_runner.js';
import type { Verifier, VerifierResult } from '../../verifier.js';
import type { IntegrityReport } from '../../verify_integrity.js';

// Mock resolution engine
vi.mock('../../resolution_engine.js', () => ({
  runResolution: vi.fn(),
}));

describe('VerifyRunner - Behavior Tests', () => {
  let context: VerifyRunnerContext;
  let deps: VerifyRunnerDeps;
  let verifier: Verifier;
  let noteVerifyFailure: ReturnType<typeof vi.fn>;
  let clearTask: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    context = {
      task: {
        id: 'TEST-1',
        title: 'Test task',
        priorityTags: ['p0'],
      },
      attemptNumber: 1,
      patchHash: 'patch123abc',
      coverageHint: 0.8,
      coverageTarget: 0.75,
      changedFiles: [{ path: 'src/file1.ts' }],
      changedLinesCoverage: 85,
      touchedFilesDelta: 1,
      failingProofProvided: false,
      mutationSmokeEnabled: false,
      workspaceRoot: '/test/workspace',
      runId: 'run-test-123',
    };

    const successVerifierResult: VerifierResult = {
      success: true,
      coverageDelta: 0.82,
      coverageTarget: 0.75,
      gateResults: [
        { name: 'tests', success: true, output: 'All tests passed' },
        { name: 'lint', success: true, output: 'No lint errors' },
      ],
      artifacts: {},
    };

    verifier = {
      verify: vi.fn(() => Promise.resolve(successVerifierResult)),
      getCoverageThreshold: vi.fn(() => 0.7),
    } as unknown as Verifier;

    noteVerifyFailure = vi.fn();
    clearTask = vi.fn();

    deps = {
      verifier,
      noteVerifyFailure,
      clearTask,
    };

    // Reset resolution engine mock
    vi.mocked(runResolution).mockResolvedValue({
      label: 'missing_dependency',
      steps: [],
      planDelta: '',
      actionables: [],
      requiresThinker: false,
      spikeBranch: undefined,
    });
  });

  // 1. HAPPY PATH - What should happen
  describe('when verification succeeds', () => {
    it('produces verify artifact', async () => {
      const result = await runVerify(context, deps);

      expect(result.artifacts.verify).toBeDefined();
      expect((result.artifacts.verify as any).success).toBe(true);
    });

    it('transitions to review state', async () => {
      const result = await runVerify(context, deps);

      expect(result.nextState).toBe('review');
    });

    it('returns success=true', async () => {
      const result = await runVerify(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes coverage delta in notes', async () => {
      const result = await runVerify(context, deps);

      expect(result.notes).toContain('Verification succeeded with coverage 0.820 (target 0.75).');
    });

    it('clears task from router', async () => {
      await runVerify(context, deps);

      expect(clearTask).toHaveBeenCalledWith('TEST-1');
    });

    it('passes all context to verifier', async () => {
      await runVerify(context, deps);

      expect(verifier.verify).toHaveBeenCalledWith({
        task: context.task,
        patchHash: 'patch123abc',
        coverageHint: 0.8,
        coverageTarget: 0.75,
        changedFiles: [{ path: 'src/file1.ts' }],
        changedLinesCoverage: 85,
        touchedFilesDelta: 1,
        failingProofProvided: false,
        mutationSmokeEnabled: false,
      });
    });

    it('uses coverage target from context', async () => {
      const result = await runVerify(context, deps);

      expect(verifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          coverageTarget: 0.75,
        })
      );
    });
  });

  // 2. VERIFICATION FAILURE PATHS
  describe('when verification fails', () => {
    beforeEach(() => {
      const failedVerifierResult: VerifierResult = {
        success: false,
        coverageDelta: 0.65,
        coverageTarget: 0.75,
        gateResults: [
          { name: 'tests', success: false, output: 'Tests failed' },
          { name: 'lint', success: true, output: 'No lint errors' },
        ],
        artifacts: {},
      };

      verifier.verify = vi.fn(() => Promise.resolve(failedVerifierResult));
    });

    it('transitions to plan state', async () => {
      const result = await runVerify(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runVerify(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runVerify(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('notes verify failure with router', async () => {
      await runVerify(context, deps);

      expect(noteVerifyFailure).toHaveBeenCalledWith('TEST-1');
    });

    it('triggers resolution engine', async () => {
      await runVerify(context, deps);

      expect(runResolution).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'TEST-1',
          runId: 'run-test-123',
          workspaceRoot: '/test/workspace',
          failingGate: 'tests',
        })
      );
    });

    it('includes resolution in artifacts', async () => {
      const result = await runVerify(context, deps);

      expect(result.artifacts.resolution).toBeDefined();
    });

    it('includes resolution in notes', async () => {
      const result = await runVerify(context, deps);

      expect(result.notes).toContain('Resolution triggered (missing_dependency); plan delta required.');
    });
  });

  // 3. INTEGRITY VIOLATION PATHS
  describe('when integrity violation is detected', () => {
    beforeEach(() => {
      const integrityReport: IntegrityReport = {
        changedLinesCoverageOk: false,
        skippedTestsFound: ['test1.ts'],
        placeholdersFound: [],
        noOpSuspicion: [],
        mutationSmokeOk: true,
      };

      const verifierResultWithIntegrity: VerifierResult = {
        success: true, // Verify gates pass, but integrity fails
        coverageDelta: 0.82,
        coverageTarget: 0.75,
        gateResults: [{ name: 'tests', success: true, output: 'Tests passed' }],
        artifacts: { integrity: integrityReport },
      };

      verifier.verify = vi.fn(() => Promise.resolve(verifierResultWithIntegrity));
    });

    it('transitions to plan state despite verify success', async () => {
      const result = await runVerify(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runVerify(context, deps);

      expect(result.success).toBe(false);
    });

    it('includes integrity report in artifacts', async () => {
      const result = await runVerify(context, deps);

      expect(result.artifacts.integrity).toBeDefined();
      expect((result.artifacts.integrity as any).changedLinesCoverageOk).toBe(false);
    });

    it('triggers resolution with integrity_guard as failing gate', async () => {
      await runVerify(context, deps);

      expect(runResolution).toHaveBeenCalledWith(
        expect.objectContaining({
          failingGate: 'integrity_guard',
        })
      );
    });
  });

  // 4. RESOLUTION OUTCOMES
  describe('when resolution requires thinker', () => {
    beforeEach(() => {
      const failedVerifierResult: VerifierResult = {
        success: false,
        coverageDelta: 0.65,
        coverageTarget: 0.75,
        gateResults: [{ name: 'tests', success: false, output: 'Tests failed' }],
        artifacts: {},
      };

      verifier.verify = vi.fn(() => Promise.resolve(failedVerifierResult));

      vi.mocked(runResolution).mockResolvedValue({
        label: 'underspecified_requirements',
        steps: [],
        planDelta: '',
        actionables: [],
        requiresThinker: true,
        spikeBranch: undefined,
      });
    });

    it('sets requireThinker flag', async () => {
      const result = await runVerify(context, deps);

      expect(result.requireThinker).toBe(true);
    });
  });

  describe('when resolution creates spike branch', () => {
    beforeEach(() => {
      const failedVerifierResult: VerifierResult = {
        success: false,
        coverageDelta: 0.65,
        coverageTarget: 0.75,
        gateResults: [{ name: 'tests', success: false, output: 'Tests failed' }],
        artifacts: {},
      };

      verifier.verify = vi.fn(() => Promise.resolve(failedVerifierResult));

      vi.mocked(runResolution).mockResolvedValue({
        label: 'integration_contract_break',
        steps: [],
        planDelta: '',
        actionables: [],
        requiresThinker: false,
        spikeBranch: 'spike/test-feature',
      });
    });

    it('sets spikeBranch in result', async () => {
      const result = await runVerify(context, deps);

      expect(result.spikeBranch).toBe('spike/test-feature');
    });

    it('includes spike branch in notes', async () => {
      const result = await runVerify(context, deps);

      expect(result.notes).toContain('Spike branch created: spike/test-feature');
    });
  });

  // 5. ERROR PATHS
  describe('when patch hash is missing', () => {
    it('throws error', async () => {
      context.patchHash = '' as any;

      await expect(runVerify(context, deps)).rejects.toThrow('Verify requires patch hash from previous implement state');
    });

    it('throws error when patchHash is undefined', async () => {
      delete (context as any).patchHash;

      await expect(runVerify(context, deps)).rejects.toThrow('Verify requires patch hash from previous implement state');
    });
  });

  describe('when verifier throws error', () => {
    it('propagates error', async () => {
      verifier.verify = vi.fn(() => {
        throw new Error('Verifier crashed');
      });

      await expect(runVerify(context, deps)).rejects.toThrow('Verifier crashed');
    });
  });

  // 6. EDGE CASES
  describe('edge cases', () => {
    it('uses verifier default coverage target when not provided', async () => {
      delete (context as any).coverageTarget;

      await runVerify(context, deps);

      expect(verifier.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          coverageTarget: 0.7, // From verifier.getCoverageThreshold()
        })
      );
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runVerify(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runVerify(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles empty changed files', async () => {
      context.changedFiles = [];

      const result = await runVerify(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles multiple changed files', async () => {
      context.changedFiles = [
        { path: 'file1.ts' },
        { path: 'file2.ts' },
        { path: 'file3.ts' },
      ];

      const result = await runVerify(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles zero coverage delta', async () => {
      const zeroVerifierResult: VerifierResult = {
        success: true,
        coverageDelta: 0,
        coverageTarget: 0.75,
        gateResults: [{ name: 'tests', success: true, output: 'Tests passed' }],
        artifacts: {},
      };

      verifier.verify = vi.fn(() => Promise.resolve(zeroVerifierResult));

      const result = await runVerify(context, deps);

      expect(result.notes).toContain('Verification succeeded with coverage 0.000 (target 0.75).');
    });

    it('detects failing gate from coverage delta when gate results do not show failure', async () => {
      const failedVerifierResult: VerifierResult = {
        success: false,
        coverageDelta: 0.5,
        coverageTarget: 0.75,
        gateResults: [], // No failing gates in results
        artifacts: {},
      };

      verifier.verify = vi.fn(() => Promise.resolve(failedVerifierResult));

      await runVerify(context, deps);

      expect(runResolution).toHaveBeenCalledWith(
        expect.objectContaining({
          failingGate: 'coverage_delta',
        })
      );
    });

    it('uses unknown failing gate when cannot determine', async () => {
      const failedVerifierResult: VerifierResult = {
        success: false,
        coverageDelta: 0.85, // Coverage is fine
        coverageTarget: 0.75,
        gateResults: [], // No failing gates
        artifacts: {},
      };

      verifier.verify = vi.fn(() => Promise.resolve(failedVerifierResult));

      await runVerify(context, deps);

      expect(runResolution).toHaveBeenCalledWith(
        expect.objectContaining({
          failingGate: 'unknown',
        })
      );
    });
  });
});
