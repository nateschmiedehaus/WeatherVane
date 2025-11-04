import { describe, expect, it, vi } from 'vitest';

import { verifyIntegrity } from '../verify_integrity.js';

describe('verifyIntegrity', () => {
  it('fails coverage gate when thresholds not met', async () => {
    const report = await verifyIntegrity({
      changedFiles: [],
      coverage: {
        changedLinesPercent: 0.5,
        touchedFilesDeltaPercent: 0.01,
      },
    });
    expect(report.changedLinesCoverageOk).toBe(false);
  });

  it('detects skipped tests and placeholders', async () => {
    const report = await verifyIntegrity({
      changedFiles: [
        {
          path: 'tests/app.test.ts',
          isTestFile: true,
          patch: [
            '--- a/tests/app.test.ts',
            '+++ b/tests/app.test.ts',
            '+describe.skip("suite", () => {',
            '+  it("should pending", () => {',
            '+    // TODO implement',
            '+    return true;',
            '+  });',
            '+});',
          ].join('\n'),
        },
      ],
      coverage: {
        changedLinesPercent: 0.9,
        touchedFilesDeltaPercent: 0.25,
      },
    });
    expect(report.skippedTestsFound).toContain('skip:tests/app.test.ts');
    expect(report.placeholdersFound).toContain('placeholder:tests/app.test.ts');
    expect(report.changedLinesCoverageOk).toBe(true);
  });

  it('flags config-only toggles as potential no-ops', async () => {
    const report = await verifyIntegrity({
      changedFiles: [
        {
          path: 'config/feature.yaml',
          isConfigFile: true,
          patch: '+enable_new_flow: true',
        },
        {
          path: 'tests/feature.spec.ts',
          isTestFile: true,
          patch: '+expect(run()).toBe(true);',
        },
      ],
      coverage: {
        changedLinesPercent: 0.7,
        touchedFilesDeltaPercent: 0.02,
      },
    });
    expect(report.noOpSuspicion).toContain('config_toggle:config/feature.yaml');
    expect(report.noOpSuspicion).toContain('config_only_with_tests_changed');
    expect(report.changedLinesCoverageOk).toBe(false);
  });

  it('runs mutation smoke tests when enabled', async () => {
    const runner = vi.fn().mockResolvedValue(true);
    const report = await verifyIntegrity({
      changedFiles: [],
      coverage: {
        changedLinesPercent: 0.9,
        touchedFilesDeltaPercent: 0.2,
      },
      mutationSmoke: {
        enabled: true,
        run: runner,
      },
    });
    expect(runner).toHaveBeenCalled();
    expect(report.mutationSmokeRan).toBe(true);
    expect(report.mutationSmokeOk).toBe(true);
  });
});
