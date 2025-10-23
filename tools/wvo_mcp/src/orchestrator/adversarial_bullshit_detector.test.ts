/**
 * Tests for AdversarialBullshitDetector
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AdversarialBullshitDetector, type TaskEvidence } from './adversarial_bullshit_detector.js';

describe('AdversarialBullshitDetector', () => {
  let detector: AdversarialBullshitDetector;
  let testWorkspace: string;

  beforeEach(async () => {
    testWorkspace = path.join(process.cwd(), 'test-workspace-bullshit');
    await fs.mkdir(testWorkspace, { recursive: true });
    detector = new AdversarialBullshitDetector(testWorkspace);
  });

  afterEach(async () => {
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('Test Integrity Detection', () => {
    it('should warn about unconditional success mocks', async () => {
      // Setup: Create test file with always-true mock
      const testFile = path.join(testWorkspace, 'feature.test.ts');
      await fs.writeFile(testFile, `
        const mock = jest.fn(() => true);
        test('should validate', () => {
          expect(mock()).toBe(true);
        });
      `);

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '1 test passed',
        changedFiles: ['feature.ts', 'feature.test.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const report = await detector.detectBullshit(evidence);

      const testIntegrityIssue = report.detections.find(d => d.category === 'test_integrity');
      expect(testIntegrityIssue).toBeDefined();
      expect(testIntegrityIssue?.description).toContain('unconditional success mocks');
    });

    it('should pass when tests and implementation both changed', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '5 tests passed',
        changedFiles: ['feature.ts', 'feature.test.ts'], // Both changed
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const report = await detector.detectBullshit(evidence);

      const testIntegrityIssue = report.detections.find(d => d.category === 'test_integrity');
      expect(testIntegrityIssue?.severity).not.toBe('CRITICAL');
    });
  });

  describe('Evidence Validity Detection', () => {
    it('should warn about missing runtime evidence', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        // NO runtime evidence
      };

      const report = await detector.detectBullshit(evidence);

      // Missing evidence is MEDIUM severity, doesn't fail overall
      expect(report.passed).toBe(true); // Only CRITICAL/HIGH fail
      const evidenceIssue = report.detections.find(d => d.category === 'evidence_validity');
      expect(evidenceIssue).toBeDefined();
      expect(evidenceIssue?.severity).toBe('MEDIUM');
      expect(evidenceIssue?.description).toContain('No runtime evidence');
    });

    it('should detect fabricated evidence files', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        runtimeEvidence: [
          { type: 'screenshot', path: 'evidence/fake_screenshot.png' }, // Doesn't exist
        ],
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(false);
      const evidenceIssue = report.detections.find(d => d.category === 'evidence_validity');
      expect(evidenceIssue?.severity).toBe('CRITICAL');
      expect(evidenceIssue?.description).toContain('does not exist');
    });

    it('should pass when valid evidence provided', async () => {
      // Create real evidence file
      const evidenceFile = path.join(testWorkspace, 'screenshot.png');
      await fs.writeFile(evidenceFile, 'fake image data');

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        runtimeEvidence: [
          { type: 'screenshot', path: 'screenshot.png' },
        ],
      };

      const report = await detector.detectBullshit(evidence);

      const evidenceIssue = report.detections.find(
        d => d.category === 'evidence_validity' && d.severity === 'CRITICAL'
      );
      expect(evidenceIssue).toBeUndefined();
    });
  });

  describe('Documentation-Code Match Detection', () => {
    it('should detect documentation referencing non-existent functions', async () => {
      // Create doc file
      const docFile = path.join(testWorkspace, 'README.md');
      await fs.writeFile(docFile, `
        # Feature
        Use the \`processData()\` function to process data.
        Call \`validateInput()\` to validate.
      `);

      // Create implementation WITHOUT those functions
      const implFile = path.join(testWorkspace, 'feature.ts');
      await fs.writeFile(implFile, `
        export function otherFunction() {
          return true;
        }
      `);

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '1 test passed',
        changedFiles: ['feature.ts'],
        testFiles: [],
        documentation: ['README.md'],
      };

      const report = await detector.detectBullshit(evidence);

      // Should detect issues with documented functions
      const docIssues = report.detections.filter(d => d.category === 'documentation_code_match');
      expect(docIssues.length).toBeGreaterThan(0);

      if (docIssues.length > 0) {
        expect(report.passed).toBe(false);
        expect(docIssues[0].severity).toBe('HIGH');
      }
    });

    it('should detect documentation referencing non-existent files', async () => {
      const docFile = path.join(testWorkspace, 'README.md');
      await fs.writeFile(docFile, `
        # Feature
        See \`src/missing_file.ts\` for implementation.
      `);

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: '1 test passed',
        changedFiles: [],
        testFiles: [],
        documentation: ['README.md'],
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(false);
      const docIssue = report.detections.find(d => d.category === 'documentation_code_match');
      expect(docIssue?.severity).toBe('CRITICAL');
      expect(docIssue?.description).toContain("doesn't exist");
    });
  });

  describe('Implementation Validity Detection', () => {
    it('should detect build errors in output', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'error TS2304: Cannot find name "Foo"\nCompilation failed with 3 errors',
        testOutput: '5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: [],
        documentation: [],
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(false);
      const implIssue = report.detections.find(d => d.category === 'implementation_validity');
      expect(implIssue?.severity).toBe('CRITICAL');
      expect(implIssue?.description).toContain('errors');
    });

    it('should detect test failures in output', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully',
        testOutput: 'FAIL src/feature.test.ts\n  ✗ should work\n\n5 failed, 10 passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(false);
      const implIssue = report.detections.find(d => d.category === 'implementation_validity');
      expect(implIssue?.severity).toBe('CRITICAL');
      expect(implIssue?.description).toContain('failures');
    });
  });

  describe('Integration Reality Detection', () => {
    it('should detect missing Prefect decorators when claimed', async () => {
      // Create doc claiming Prefect
      const docFile = path.join(testWorkspace, 'README.md');
      await fs.writeFile(docFile, 'Implemented Prefect flow for data ingestion');

      // Create implementation WITHOUT Prefect
      const implFile = path.join(testWorkspace, 'flow.py');
      await fs.writeFile(implFile, `
        def ingest_data():
            process()
      `);

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Success',
        testOutput: '1 test passed',
        changedFiles: ['flow.py'],
        testFiles: [],
        documentation: ['README.md'],
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(false);
      const integrationIssue = report.detections.find(d => d.category === 'integration_reality');
      expect(integrationIssue?.severity).toBe('CRITICAL');
      expect(integrationIssue?.description).toContain('Prefect');
    });

    it('should pass when framework is actually used', async () => {
      const docFile = path.join(testWorkspace, 'README.md');
      await fs.writeFile(docFile, 'Implemented Prefect flow');

      const implFile = path.join(testWorkspace, 'flow.py');
      await fs.writeFile(implFile, `
        from prefect import flow, task

        @flow
        def ingest_data():
            process()
      `);

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Success',
        testOutput: '1 test passed',
        changedFiles: ['flow.py'],
        testFiles: [],
        documentation: ['README.md'],
      };

      const report = await detector.detectBullshit(evidence);

      const integrationIssue = report.detections.find(
        d => d.category === 'integration_reality' && d.severity === 'CRITICAL'
      );
      expect(integrationIssue).toBeUndefined();
    });
  });

  describe('Superficial Completion Detection', () => {
    it('should detect empty JSON files', async () => {
      const jsonFile = path.join(testWorkspace, 'metrics.json');
      await fs.writeFile(jsonFile, '{}');

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Success',
        testOutput: '1 test passed',
        changedFiles: ['metrics.json'],
        testFiles: [],
        documentation: [],
      };

      const report = await detector.detectBullshit(evidence);

      const superficialIssue = report.detections.find(d => d.category === 'superficial_completion');
      expect(superficialIssue?.severity).toBe('HIGH');
      expect(superficialIssue?.description).toContain('empty');
    });

    it('should pass when data files have content', async () => {
      const jsonFile = path.join(testWorkspace, 'metrics.json');
      await fs.writeFile(jsonFile, JSON.stringify({ metrics: [1, 2, 3], count: 100 }));

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Success',
        testOutput: '1 test passed',
        changedFiles: ['metrics.json'],
        testFiles: [],
        documentation: [],
      };

      const report = await detector.detectBullshit(evidence);

      const superficialIssue = report.detections.find(
        d => d.category === 'superficial_completion' && d.severity === 'HIGH'
      );
      expect(superficialIssue).toBeUndefined();
    });
  });

  describe('Complete Flow', () => {
    it('should pass clean implementation with all evidence', async () => {
      // Create complete evidence
      const implFile = path.join(testWorkspace, 'feature.ts');
      await fs.writeFile(implFile, 'export function process() { return true; }');

      const testFile = path.join(testWorkspace, 'feature.test.ts');
      await fs.writeFile(testFile, 'test("works", () => expect(process()).toBe(true))');

      const docFile = path.join(testWorkspace, 'README.md');
      await fs.writeFile(docFile, 'Use `process()` function');

      const evidenceFile = path.join(testWorkspace, 'screenshot.png');
      await fs.writeFile(evidenceFile, 'evidence data');

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ feature.test.ts (1 test) 5ms\n\nTest Files  1 passed (1)\n     Tests  1 passed (1)',
        changedFiles: ['feature.ts', 'feature.test.ts'],
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'],
        runtimeEvidence: [{ type: 'screenshot', path: 'screenshot.png' }],
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(true);
      expect(report.detections.length).toBe(0);
      expect(report.summary).toContain('no bullshit detected');
    });

    it('should fail implementation with multiple critical issues', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'error TS2304: Cannot find name',
        testOutput: 'FAIL: 5 tests failed',
        changedFiles: ['feature.test.ts'], // Only test changed
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'], // File doesn't exist
        // No runtime evidence
      };

      const report = await detector.detectBullshit(evidence);

      expect(report.passed).toBe(false);
      expect(report.detections.length).toBeGreaterThan(0);

      const criticalIssues = report.detections.filter(d => d.severity === 'CRITICAL');
      expect(criticalIssues.length).toBeGreaterThanOrEqual(1); // At least 1 critical
      expect(report.summary).toContain('REJECTED');
    });
  });
});
