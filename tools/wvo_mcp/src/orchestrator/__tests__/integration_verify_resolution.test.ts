import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { classifyFailure, buildPlaybook, runResolution } from '../resolution_engine.js';
import type { ResolutionContext } from '../resolution_engine.js';
import type { VerifierResult, GateResult } from '../verifier.js';
import type { IntegrityReport } from '../verify_integrity.js';

/**
 * Integration test: Verify → Resolution Engine flow
 *
 * Tests the complete path:
 * 1. Verify fails with specific gate failure
 * 2. Resolution engine classifies the blocker
 * 3. Resolution engine generates playbook steps
 * 4. Artifacts are written to resources://runs
 */
describe('Verify → Resolution Integration', () => {
  let tmpDir: string;
  let runId: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolution-integration-'));
    runId = 'test-run-001';
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('classifies missing dependency failure and generates resolution', async () => {
    // Simulate verify failure: missing dependency
    const verifierResult: VerifierResult = {
      success: false,
      coverageDelta: 0,
      coverageTarget: 0.05,
      gateResults: [
        { name: 'tests.run', success: false, output: 'Error: module not found "missing-package"' },
        { name: 'lint.run', success: true, output: '' },
        { name: 'typecheck.run', success: true, output: '' },
        { name: 'security.scan', success: true, output: '' },
        { name: 'license.check', success: true, output: '' },
      ],
      artifacts: {},
    };

    const context: ResolutionContext = {
      taskId: 'T1',
      runId,
      workspaceRoot: tmpDir,
      verifier: verifierResult,
      failingGate: 'tests.run',
      logSnippets: ['Error: module not found "missing-package"', 'at require (internal/modules/cjs/loader.js)'],
    };

    // Step 1: Classify the blocker
    const label = classifyFailure(context);
    expect(label).toBe('missing_dependency');

    // Step 2: Generate playbook
    const playbook = buildPlaybook(label);
    expect(playbook.length).toBeGreaterThan(0);
    expect(playbook[0].cause_hypothesis).toContain('Dependency');
    expect(playbook[0].next_state).toBe('Plan');

    // Step 3: Run full resolution
    const result = await runResolution(context);
    expect(result.label).toBe('missing_dependency');
    expect(result.planDelta).toBeDefined();
    expect(result.planDelta.length).toBeGreaterThan(0);
    // runResolution adds ceilings to steps, so check length and key fields
    expect(result.steps.length).toBe(playbook.length);
    expect(result.steps[0].cause_hypothesis).toBe(playbook[0].cause_hypothesis);
    expect(result.actionables.length).toBeGreaterThan(0);

    // Step 4: Verify artifact path is set (actual file write happens in real workspace)
    expect(result.artifactPath).toBeDefined();
    if (result.artifactPath) {
      // In real implementation, artifact would be written via resource:// protocol
      // For tests, just verify the path structure is correct
      expect(result.artifactPath).toContain('resolution');
      expect(result.artifactPath).toContain('T1');
    }
  });

  it('classifies flaky test failure and suggests stabilization', async () => {
    const verifierResult: VerifierResult = {
      success: false,
      coverageDelta: 0,
      coverageTarget: 0.05,
      gateResults: [
        { name: 'tests.run', success: false, output: 'Test "async operation" is flaky - timeout exceeded' },
        { name: 'lint.run', success: true, output: '' },
        { name: 'typecheck.run', success: true, output: '' },
        { name: 'security.scan', success: true, output: '' },
        { name: 'license.check', success: true, output: '' },
      ],
      artifacts: {},
    };

    const context: ResolutionContext = {
      taskId: 'T2',
      runId,
      workspaceRoot: tmpDir,
      verifier: verifierResult,
      failingGate: 'tests.run',
      logSnippets: ['Test "async operation" is flaky', 'Expected 200, got 500', 'Timeout exceeded'],
    };

    const label = classifyFailure(context);
    expect(label).toBe('flaky_test');

    const result = await runResolution(context);
    expect(result.label).toBe('flaky_test');
    expect(result.spikeBranch).toBeUndefined(); // Flaky tests don't create spike branches
    expect(result.requiresThinker).toBe(false); // Flaky tests don't require thinker
  });

  it('classifies underspecified requirements when coverage is low', async () => {
    const integrityReport: IntegrityReport = {
      changedLinesCoverageOk: false, // Coverage below threshold
      placeholdersFound: [],
      skippedTestsFound: [],
      noOpSuspicion: [],
    };

    const verifierResult: VerifierResult = {
      success: false,
      coverageDelta: 0.03, // Below 0.8 default threshold (coverageLagging = true)
      coverageTarget: 0.8,
      gateResults: [
        { name: 'tests.run', success: true, output: '' },
        { name: 'lint.run', success: true, output: '' },
        { name: 'typecheck.run', success: true, output: '' },
        { name: 'security.scan', success: true, output: '' },
        { name: 'license.check', success: true, output: '' },
      ],
      artifacts: { integrity: integrityReport },
    };

    const context: ResolutionContext = {
      taskId: 'T3',
      runId,
      workspaceRoot: tmpDir,
      verifier: verifierResult,
      integrity: integrityReport,
      logSnippets: ['Changed lines coverage: 3%', 'Target: 80%'],
    };

    const label = classifyFailure(context);
    expect(label).toBe('underspecified_requirements'); // Low coverage triggers underspecified_requirements

    const result = await runResolution(context);
    expect(result.label).toBe('underspecified_requirements');
    expect(result.planDelta).toBeDefined();
    expect(result.requiresThinker).toBe(true); // Underspecified requirements require thinker
    expect(result.spikeBranch).toBeDefined(); // Should create spike branch
  });

  it('handles underspecified requirements with plan revision', async () => {
    const verifierResult: VerifierResult = {
      success: false,
      coverageDelta: 0,
      coverageTarget: 0.05,
      gateResults: [
        { name: 'tests.run', success: false, output: 'Expected behavior X but got Y' },
        { name: 'lint.run', success: true, output: '' },
        { name: 'typecheck.run', success: true, output: '' },
        { name: 'security.scan', success: true, output: '' },
        { name: 'license.check', success: true, output: '' },
      ],
      artifacts: {},
    };

    const context: ResolutionContext = {
      taskId: 'T4',
      runId,
      workspaceRoot: tmpDir,
      verifier: verifierResult,
      failingGate: 'tests.run',
      logSnippets: ['Expected behavior X but got Y', 'Acceptance criteria unclear'],
    };

    const label = classifyFailure(context);
    expect(label).toBe('underspecified_requirements');

    const result = await runResolution(context);
    expect(result.label).toBe('underspecified_requirements');
    expect(result.steps[0].next_state).toBe('Plan'); // Should loop back to Plan
    expect(result.requiresThinker).toBe(true); // Underspecified requirements need thinking
  });

  it('end-to-end: failure → classification → resolution → artifact', async () => {
    // Complete integration test simulating full flow
    const verifierResult: VerifierResult = {
      success: false,
      coverageDelta: 0,
      coverageTarget: 0.05,
      gateResults: [
        { name: 'tests.run', success: false, output: 'TypeError: undefined is not a function' },
        { name: 'lint.run', success: true, output: '' },
        { name: 'typecheck.run', success: false, output: 'Type error at line 42' },
        { name: 'security.scan', success: true, output: '' },
        { name: 'license.check', success: true, output: '' },
      ],
      artifacts: {},
    };

    const context: ResolutionContext = {
      taskId: 'T-E2E',
      runId,
      workspaceRoot: tmpDir,
      verifier: verifierResult,
      failingGate: 'tests.run',
      logSnippets: [
        'TypeError: undefined is not a function',
        'at processResult (src/module.ts:42:15)',
        'Type error at line 42',
      ],
    };

    // Full flow
    const label = classifyFailure(context);
    expect(label).toBeDefined();

    const playbook = buildPlaybook(label);
    expect(playbook.length).toBeGreaterThan(0);

    const resolution = await runResolution(context);
    expect(resolution.label).toBe(label);
    // runResolution adds ceilings to steps, so check length and key fields instead of exact equality
    expect(resolution.steps.length).toBe(playbook.length);
    expect(resolution.steps[0].cause_hypothesis).toBe(playbook[0].cause_hypothesis);
    expect(resolution.steps[0].next_state).toBe(playbook[0].next_state);
    expect(resolution.planDelta).toBeDefined();
    expect(resolution.actionables.length).toBeGreaterThan(0);

    // Verify telemetry artifact path is set
    expect(resolution.artifactPath).toBeDefined();
    if (resolution.artifactPath) {
      // In real implementation, artifact would be written via resource:// protocol
      // For integration tests, just verify the path structure is correct
      expect(resolution.artifactPath).toContain('resolution');
      expect(resolution.artifactPath).toContain('T-E2E');
    }
  });
});
