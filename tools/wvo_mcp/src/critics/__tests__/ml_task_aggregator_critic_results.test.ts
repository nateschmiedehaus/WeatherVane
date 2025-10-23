/**
 * Tests for ML Task Aggregator critic result tracking
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MLTaskAggregator } from '../ml_task_aggregator.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

describe('MLTaskAggregator - Critic Results', () => {
  let aggregator: MLTaskAggregator;
  let testWorkspace: string;
  let testStateRoot: string;

  beforeEach(async () => {
    testWorkspace = '/tmp/test_ml_aggregator_critics';
    testStateRoot = path.join(testWorkspace, 'state');
    await fs.mkdir(testStateRoot, { recursive: true });
    aggregator = new MLTaskAggregator(testWorkspace, testStateRoot);
  });

  afterEach(async () => {
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('Critic Result Extraction', () => {
    it('should extract passing critic results with metrics', async () => {
      const content = `
# Task Completion Report

## Critics
Modeling Reality: ✅ Pass - Model accuracy 95%
Academic Rigor: ✅ Methodology validated
Data Quality: ✓ Data validated
      `;

      const docsDir = path.join(testWorkspace, 'docs');
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, 'TEST_COMPLETION_REPORT.md');
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask('TEST_TASK', 'docs/TEST_COMPLETION_REPORT.md');

      expect(report?.critic_results).toBeDefined();
      expect(report?.critic_results.modeling_reality_v2?.passed).toBe(true);
      expect(report?.critic_results.modeling_reality_v2?.message).toBe('95%');
      expect(report?.critic_results.academic_rigor?.passed).toBe(true);
      expect(report?.critic_results.data_quality?.passed).toBe(true);
    });

    it('should extract failing critic results with reasons', async () => {
      const content = `
# Task Completion Report

## Critics
Modeling Reality: ✗ Model accuracy 45%
Academic Rigor: ✗ Methodology incomplete
Data Quality: ✘ Data corrupted
      `;

      const docsDir = path.join(testWorkspace, 'docs');
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, 'TEST_COMPLETION_REPORT.md');
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask('TEST_TASK', 'docs/TEST_COMPLETION_REPORT.md');

      expect(report?.critic_results).toBeDefined();
      expect(report?.critic_results.modeling_reality_v2?.passed).toBe(false);
      expect(report?.critic_results.modeling_reality_v2?.message).toBe('45%');
      expect(report?.critic_results.academic_rigor?.passed).toBe(false);
      expect(report?.critic_results.data_quality?.passed).toBe(false);
    });

    it('should handle missing critic sections gracefully', async () => {
      const content = `
# Task Completion Report

## Tests
All tests passed
      `;

      const docsDir = path.join(testWorkspace, 'docs');
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, 'TEST_COMPLETION_REPORT.md');
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask('TEST_TASK', 'docs/TEST_COMPLETION_REPORT.md');

      expect(report?.critic_results).toBeDefined();
      expect(report?.critic_results.modeling_reality_v2).toBeUndefined();
      expect(report?.critic_results.academic_rigor).toBeUndefined();
      expect(report?.critic_results.data_quality).toBeUndefined();
    });

    it('should handle partial critic results', async () => {
      const content = `
# Task Completion Report

## Critics
Modeling Reality: ✅ Pass - Model accuracy 95%
// Other critics not reported
      `;

      const docsDir = path.join(testWorkspace, 'docs');
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, 'TEST_COMPLETION_REPORT.md');
      await fs.writeFile(reportPath, content);

      const report = await aggregator.analyzeCompletedTask('TEST_TASK', 'docs/TEST_COMPLETION_REPORT.md');

      expect(report?.critic_results).toBeDefined();
      expect(report?.critic_results.modeling_reality_v2?.passed).toBe(true);
      expect(report?.critic_results.modeling_reality_v2?.message).toBe('95%');
      expect(report?.critic_results.academic_rigor).toBeUndefined();
      expect(report?.critic_results.data_quality).toBeUndefined();
    });

    it('should detect critic failures in task aggregation report', async () => {
      const content = `
# Task Completion Report

## Critics
Modeling Reality: ✗ Model accuracy 45%
Academic Rigor: ✗ Methodology incomplete
Data Quality: ✘ Data corrupted
      `;

      const docsDir = path.join(testWorkspace, 'docs');
      await fs.mkdir(docsDir, { recursive: true });
      const reportPath = path.join(docsDir, 'TEST_COMPLETION_REPORT.md');
      await fs.writeFile(reportPath, content);

      const report = await aggregator.generateAggregatedReport();

      // Should detect critic failures as blockers
      expect(report.blockers_detected).toContain(expect.stringMatching(/Model accuracy.*45%/));
      expect(report.blockers_detected).toContain(expect.stringMatching(/Methodology incomplete/));
      expect(report.blockers_detected).toContain(expect.stringMatching(/Data corrupted/));
    });
  });
});