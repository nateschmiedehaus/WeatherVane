/**
 * Tests for QualityGateOrchestrator
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { TaskEvidence } from './adversarial_bullshit_detector.js';
import { QualityGateOrchestrator, type QualityGateDecision } from './quality_gate_orchestrator.js';

describe('QualityGateOrchestrator', () => {
  let orchestrator: QualityGateOrchestrator;
  let testWorkspace: string;

  beforeEach(async () => {
    testWorkspace = path.join(process.cwd(), 'test-workspace-orchestrator');
    await fs.mkdir(testWorkspace, { recursive: true });

    // Create state directories
    await fs.mkdir(path.join(testWorkspace, 'state/analytics'), { recursive: true });

    // Create minimal config
    const configDir = path.join(testWorkspace, 'state');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'quality_gates.yaml'),
      `quality_gates:
  automated:
    build_required: true
    tests_required: true
    audit_required: true
    no_exceptions: true
  post_task:
    required_reviewers: ["automated", "orchestrator", "adversarial"]
    consensus_rule: "unanimous"
`
    );

    orchestrator = new QualityGateOrchestrator(testWorkspace);
  });

  afterEach(async () => {
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('Pre-Task Review', () => {
    it('should approve simple task with good plan', async () => {
      const review = await orchestrator.reviewTaskPlan('T1', {
        title: 'Add logging',
        description: 'Add debug logging to feature',
        filesAffected: ['feature.ts'],
        estimatedComplexity: 'simple',
        answers: {
          verification_plan: 'npm run build && npm test',
          rollback_plan: 'git revert',
        },
      });

      expect(review.approved).toBe(true);
      expect(review.concerns.length).toBe(0);
      expect(review.modelUsed).toContain('sonnet'); // Simple uses STANDARD
    });

    it('should reject task with no rollback plan', async () => {
      const review = await orchestrator.reviewTaskPlan('T1', {
        title: 'Database migration',
        description: 'Migrate schema',
        filesAffected: ['schema.sql'],
        estimatedComplexity: 'medium',
        answers: {
          verification_plan: 'npm test',
          rollback_plan: 'none',
        },
      });

      expect(review.approved).toBe(false);
      expect(review.concerns).toContain('No rollback plan - cannot safely deploy');
      expect(review.modelUsed).toContain('opus'); // Medium uses POWERFUL
    });

    it('should detect complexity mismatch', async () => {
      const review = await orchestrator.reviewTaskPlan('T1', {
        title: 'Refactor',
        description: 'Major refactor',
        filesAffected: Array.from({ length: 15 }, (_, i) => `file${i}.ts`),
        estimatedComplexity: 'simple', // Wrong!
        answers: {
          verification_plan: 'npm test',
          rollback_plan: 'git revert',
        },
      });

      expect(review.approved).toBe(false);
      expect(review.concerns.some(c => c.includes('complexity mismatch'))).toBe(true);
    });

    it('should warn about manual-only verification', async () => {
      const review = await orchestrator.reviewTaskPlan('T1', {
        title: 'Add feature',
        description: 'New feature',
        filesAffected: ['feature.ts'],
        estimatedComplexity: 'simple',
        answers: {
          verification_plan: 'manual testing only',
          rollback_plan: 'git revert',
        },
      });

      expect(review.approved).toBe(false);
      expect(review.concerns.some(c => c.includes('No automated verification'))).toBe(true);
    });
  });

  describe('Automated Checks Gate', () => {
    it('should pass when build and tests succeed', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ Tests passed (5 tests)',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.reviews.automated?.passed).toBe(true);
      expect(decision.reviews.automated?.failures.length).toBe(0);
    });

    it('should instantly reject on build errors with no_exceptions', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'error TS2304: Cannot find name "Foo"\\nCompilation failed',
        testOutput: '✓ Tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.reviews.automated?.passed).toBe(false);
      expect(decision.reviews.automated?.failures).toContain('Build contains errors');
      expect(decision.finalReasoning).toContain('AUTOMATED CHECKS FAILED');
    });

    it('should instantly reject on test failures', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: 'FAIL src/feature.test.ts\\n  ✗ should work\\n\\n5 failed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.reviews.automated?.failures).toContain('Tests are failing');
    });

    it('should detect TypeScript compilation errors', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'error TS2322: Type "string" is not assignable to type "number"',
        testOutput: '✓ Tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.reviews.automated?.failures).toContain('TypeScript compilation errors present');
    });
  });

  describe('Orchestrator Challenge Gate', () => {
    it('should challenge missing runtime evidence', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ Tests passed (5 tests)',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        // NO runtime evidence
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.reviews.orchestrator?.approved).toBe(false);
      expect(decision.reviews.orchestrator?.blockers).toContain(
        'No runtime evidence provided - cannot verify feature actually works'
      );
    });

    it('should challenge missing test files', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ Tests passed',
        changedFiles: ['feature.ts'],
        testFiles: [], // NO tests!
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.reviews.orchestrator?.blockers).toContain(
        'No test files provided - no way to verify correctness'
      );
    });

    it('should warn about insufficient tests', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 1 test passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      // Create evidence file
      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'evidence/screenshot.png'), 'fake');

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.reviews.orchestrator?.warnings?.some(w => w.includes('Very few tests'))).toBe(true);
    });

    it('should approve when all evidence is adequate', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 10 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      // Create evidence file
      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'evidence/screenshot.png'), 'fake');

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.reviews.orchestrator?.approved).toBe(true);
      expect(decision.reviews.orchestrator?.blockers.length).toBe(0);
    });
  });

  describe('Consensus Decision', () => {
    it('should require unanimous approval', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 10 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      // Create all evidence
      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'evidence/screenshot.png'), 'fake');
      await fs.writeFile(path.join(testWorkspace, 'feature.ts'), 'export function process() {}');
      await fs.writeFile(path.join(testWorkspace, 'feature.test.ts'), 'test("works", () => {})');
      await fs.writeFile(path.join(testWorkspace, 'README.md'), 'Use `process()` function');

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('APPROVED');
      expect(decision.finalReasoning).toContain('All quality gates passed');
      expect(decision.consensusReached).toBe(true);
    });

    it('should reject if any gate fails (unanimous rule)', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 10 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: [], // Missing tests - orchestrator will reject
        documentation: [],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('REJECTED');
      expect(decision.finalReasoning).toContain('rejected');
    });

    it('should include all reviewer feedback in decision', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 10 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'],
        runtimeEvidence: [{
          type: 'logs',
          path: '/tmp/test-run.log',
          content: 'Feature tested with 100 items, memory stayed under 500MB'
        }],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.reviews.automated).toBeDefined();
      expect(decision.reviews.orchestrator).toBeDefined();
      expect(decision.reviews.adversarial).toBeDefined();
      expect(decision.reviews.peer).toBeDefined();
    });
  });

  describe('Decision Logging', () => {
    it('should log all decisions to JSONL file', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      // Create evidence
      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      await fs.writeFile(path.join(testWorkspace, 'evidence/screenshot.png'), 'fake');
      await fs.writeFile(path.join(testWorkspace, 'feature.ts'), 'export function process() {}');
      await fs.writeFile(path.join(testWorkspace, 'feature.test.ts'), 'test("works", () => {})');

      await orchestrator.verifyTaskCompletion('T1', evidence);

      // Check log file exists
      const logPath = path.join(testWorkspace, 'state/analytics/quality_gate_decisions.jsonl');
      const exists = await fs.access(logPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Parse log
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      const decision: QualityGateDecision = JSON.parse(lines[lines.length - 1]);
      expect(decision.taskId).toBe('T1');
      expect(decision.decision).toBeDefined();
      expect(decision.timestamp).toBeDefined();
    });

    it('should retrieve recent decisions', async () => {
      // Create multiple decisions
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ 5 tests passed',
        changedFiles: ['feature.ts'],
        testFiles: ['feature.test.ts'],
        documentation: [],
      };

      await orchestrator.verifyTaskCompletion('T1', evidence);
      await orchestrator.verifyTaskCompletion('T2', evidence);
      await orchestrator.verifyTaskCompletion('T3', evidence);

      const recentDecisions = await orchestrator.getRecentDecisions(2);
      expect(recentDecisions.length).toBe(2);
      expect(recentDecisions[0].taskId).toBe('T3'); // Most recent first
      expect(recentDecisions[1].taskId).toBe('T2');
    });
  });

  describe('Model Tier Selection', () => {
    it('should use STANDARD model for simple tasks', async () => {
      const review = await orchestrator.reviewTaskPlan('T1', {
        title: 'Simple fix',
        description: 'Fix typo',
        filesAffected: ['README.md'],
        estimatedComplexity: 'simple',
        answers: {
          verification_plan: 'npm test',
          rollback_plan: 'git revert',
        },
      });

      expect(review.modelUsed).toContain('sonnet');
    });

    it('should use POWERFUL model for medium/complex tasks', async () => {
      const review = await orchestrator.reviewTaskPlan('T1', {
        title: 'Architecture change',
        description: 'Refactor core',
        filesAffected: ['core.ts', 'api.ts', 'db.ts'],
        estimatedComplexity: 'medium',
        answers: {
          verification_plan: 'npm test && integration tests',
          rollback_plan: 'feature flag rollback',
        },
      });

      expect(review.modelUsed).toContain('opus');
    });
  });

  describe('Complete Flow', () => {
    it('should pass clean implementation through all gates', async () => {
      // Create complete, valid implementation
      const implFile = path.join(testWorkspace, 'feature.ts');
      await fs.writeFile(implFile, 'export function calculate(x: number) { return x * 2; }');

      const testFile = path.join(testWorkspace, 'feature.test.ts');
      await fs.writeFile(testFile, `
        import { calculate } from './feature';
        test('doubles number', () => {
          expect(calculate(5)).toBe(10);
        });
        test('handles zero', () => {
          expect(calculate(0)).toBe(0);
        });
        test('handles negatives', () => {
          expect(calculate(-5)).toBe(-10);
        });
      `);

      const docFile = path.join(testWorkspace, 'README.md');
      await fs.writeFile(docFile, 'Use `calculate(x)` to double a number');

      await fs.mkdir(path.join(testWorkspace, 'evidence'), { recursive: true });
      const evidenceFile = path.join(testWorkspace, 'evidence/screenshot.png');
      await fs.writeFile(evidenceFile, 'screenshot data');

      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'Compiled successfully. 0 errors.',
        testOutput: '✓ feature.test.ts (3 tests) 5ms\\n\\nTest Files  1 passed (1)\\n     Tests  3 passed (3)',
        changedFiles: ['feature.ts', 'feature.test.ts'],
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'],
        runtimeEvidence: [{ type: 'screenshot', path: 'evidence/screenshot.png' }],
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('APPROVED');
      expect(decision.reviews.automated?.passed).toBe(true);
      expect(decision.reviews.orchestrator?.approved).toBe(true);
      expect(decision.reviews.adversarial?.passed).toBe(true);
      expect(decision.reviews.peer?.approved).toBe(true);
      expect(decision.consensusReached).toBe(true);
    });

    it('should reject incomplete implementation at multiple gates', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        buildOutput: 'error TS2304: Cannot find name',
        testOutput: 'FAIL: 5 tests failed',
        changedFiles: ['feature.test.ts'], // Only test file changed
        testFiles: ['feature.test.ts'],
        documentation: ['README.md'], // File doesn't exist
        // No runtime evidence
      };

      const decision = await orchestrator.verifyTaskCompletion('T1', evidence);

      expect(decision.decision).toBe('REJECTED');

      // Should fail automated gate instantly
      expect(decision.reviews.automated?.passed).toBe(false);

      // Should have multiple rejection reasons
      const criticalIssues = [
        ...(decision.reviews.automated?.failures || []),
        ...(decision.reviews.orchestrator?.blockers || []),
      ];
      expect(criticalIssues.length).toBeGreaterThan(0);
    });
  });
});
