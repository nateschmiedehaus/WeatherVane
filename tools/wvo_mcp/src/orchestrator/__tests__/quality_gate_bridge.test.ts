import { describe, it, expect } from 'vitest';
import type { Task } from '../state_machine.js';
import type { ImplementerAgentResult } from '../implementer_agent.js';
import type { VerifierResult } from '../verifier.js';
import { buildTaskEvidenceFromArtifacts } from '../quality_gate_bridge.js';

const baseTask: Task = {
  id: 'T-QG',
  title: 'Quality gate bridge task',
  description: 'Ensure evidence conversion works',
  type: 'task',
  status: 'pending',
  created_at: Date.now(),
};

const sampleImplementerResult: ImplementerAgentResult = {
  success: true,
  patchHash: 'abc123',
  notes: [],
  coverageHint: 0.1,
  changedFiles: [
    { path: 'src/app.ts', patch: '+console.log("hi")' },
    { path: 'docs/README.md', patch: '+updated docs' },
    { path: 'tests/app.test.ts', patch: '+new test', isTestFile: true },
  ],
  changedLinesCoverage: 0.92,
  touchedFilesDelta: 0.2,
  mutationSmokeEnabled: true,
};

const sampleVerifierResult: VerifierResult = {
  success: true,
  coverageDelta: 0.11,
  coverageTarget: 0.05,
  gateResults: [
    { name: 'tests.run', success: true, output: '✓ tests.run ok' },
    { name: 'lint.run', success: true, output: 'lint clean' },
    { name: 'typecheck.run', success: true, output: 'tsc clean' },
  ],
  artifacts: {
    integrity: {
      changedLinesCoverageOk: true,
      skippedTestsFound: [],
      noOpSuspicion: [],
      placeholdersFound: [],
    },
  },
};

describe('buildTaskEvidenceFromArtifacts', () => {
  it('returns null when required artifacts are missing', () => {
    expect(
      buildTaskEvidenceFromArtifacts(baseTask, { implement: sampleImplementerResult })
    ).toBeNull();
    expect(
      buildTaskEvidenceFromArtifacts(baseTask, { verify: sampleVerifierResult })
    ).toBeNull();
  });

  it('maps verifier outputs and changed files into TaskEvidence', () => {
    const evidence = buildTaskEvidenceFromArtifacts(baseTask, {
      implement: sampleImplementerResult,
      verify: sampleVerifierResult,
      monitor: { smoke: { success: true, log: 'smoke ok' } },
    });
    expect(evidence).not.toBeNull();
    expect(evidence?.testOutput).toContain('tests.run ok');
    expect(evidence?.buildOutput).toContain('lint clean');
    expect(evidence?.documentation).toEqual(['docs/README.md']);
    expect(evidence?.testFiles).toEqual(['tests/app.test.ts']);
    expect(evidence?.changedFiles).toContain('src/app.ts');
    expect(evidence?.runtimeEvidence?.[0].content).toContain('smoke ok');
  });
});
