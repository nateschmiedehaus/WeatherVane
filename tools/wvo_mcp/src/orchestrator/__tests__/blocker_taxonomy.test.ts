import { describe, expect, it } from 'vitest';
import {
  classifyBlocker,
  getResolutionCeiling,
  requiresThinker,
  shouldSpike,
  describeEvidenceExpectation,
} from '../blocker_taxonomy.js';

describe('blocker_taxonomy', () => {
  it('classifies secrets and config toggles as external_secret_or_credential', () => {
    const label = classifyBlocker({
      taskId: 'T1',
      errorText: 'Missing secret token',
      integrity: { placeholdersFound: [], skippedTestsFound: [], noOpSuspicion: ['config_only_with_tests_changed'] },
    });
    expect(label).toBe('external_secret_or_credential');
  });

  it('classifies coverage shortfall with placeholders as underspecified requirements', () => {
    const label = classifyBlocker({
      taskId: 'T2',
      coverageDelta: 0.4,
      coverageTarget: 0.8,
      integrity: {
        placeholdersFound: ['placeholder:file.ts'],
        skippedTestsFound: [],
        noOpSuspicion: [],
      },
    });
    expect(label).toBe('underspecified_requirements');
    expect(requiresThinker(label)).toBe(true);
    expect(shouldSpike(label)).toBe(true);
  });

  it('classifies lint gate failures as lint_type_security_blocker', () => {
    const label = classifyBlocker({
      taskId: 'T3',
      gate: 'security.scan',
      errorText: 'semgrep violation',
    });
    expect(label).toBe('lint_type_security_blocker');
    expect(describeEvidenceExpectation(label)).toContain('lint/security');
  });

  it('falls back to missing_dependency when classifier cannot determine a more specific label', () => {
    const label = classifyBlocker({
      taskId: 'T4',
      logs: ['Module not found: xyz'],
    });
    expect(label).toBe('missing_dependency');
    expect(getResolutionCeiling(label).attempts).toBeGreaterThan(0);
  });
});
