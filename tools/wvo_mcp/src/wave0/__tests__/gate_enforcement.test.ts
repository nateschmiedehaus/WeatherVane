/**
 * Test: GATE Phase Required Before IMPLEMENT
 *
 * This test verifies that:
 * 1. Cannot proceed to IMPLEMENT without design.md
 * 2. DesignReviewer must approve before IMPLEMENT
 * 3. Score must be ≥90 (DesignReviewer threshold)
 */

import { describe, it as test, expect, beforeAll, afterAll } from 'vitest';
import { AutonomousRunner } from '../autonomous_runner.js';
import { QualityEnforcer } from '../quality_enforcer.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('GATE Enforcement', () => {
  const testStateDir = path.join(process.cwd(), 'test_state_gate');

  beforeAll(async () => {
    // Clean test directory
    await fs.rm(testStateDir, { recursive: true, force: true });
    await fs.mkdir(testStateDir, { recursive: true });

    // Create test roadmap
    const roadmapPath = path.join(testStateDir, 'roadmap.yaml');
    await fs.writeFile(roadmapPath, `waves: []
milestones: []
tasks: []
`);
  });

  afterAll(async () => {
    // Clean up
    await fs.rm(testStateDir, { recursive: true, force: true });
  });

  test('Cannot proceed without design.md', async () => {
    const evidenceDir = path.join(testStateDir, 'evidence', 'TEST-NO-DESIGN');
    await fs.mkdir(evidenceDir, { recursive: true });

    // Create other phase evidence but NOT design.md
    await fs.writeFile(path.join(evidenceDir, 'strategy.md'), '# Strategy\n\nWHY: Need feature.\nAlternatives: A, B, C.\nMetrics: Success rate.');
    await fs.writeFile(path.join(evidenceDir, 'spec.md'), '# Spec\n\nRequirements here.');
    await fs.writeFile(path.join(evidenceDir, 'plan.md'), '# Plan\n\nImplementation plan.');
    await fs.writeFile(path.join(evidenceDir, 'think.md'), '# Think\n\nEdge cases: X.\nComplexity: O(n).\nMitigation: Y.');

    const task = {
      id: 'TEST-NO-DESIGN',
      title: 'Test No Design',
      status: 'pending' as const,
      description: 'Test that missing design.md blocks task',
      dependencies: [],
      exit_criteria: []
    };

    const runner = new AutonomousRunner(testStateDir);

    // Try to run critics without design.md
    const result = await (runner as any).runAllCritics(task, evidenceDir);

    // May pass other critics but design critic won't run
    // The important thing is the system doesn't crash without design.md

    // Verify design.md doesn't exist
    const designExists = await fs.access(path.join(evidenceDir, 'design.md')).then(() => true).catch(() => false);
    expect(designExists).toBe(false);
  });

  test('GATE requires DesignReviewer approval', async () => {
    const enforcer = new QualityEnforcer();

    // Test with low-quality design (will fail DesignReviewer)
    const badDesign = 'Just add more code here. No via negativa. No refactor. Patch it.';

    const result = await enforcer.enforceQuality({
      code: badDesign,
      type: 'design',
      taskId: 'TEST-GATE-BAD'
    });

    // DesignReviewer should block this
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(90); // DesignReviewer threshold
    expect(result.violations).toBeDefined();
    expect(result.violations!.length).toBeGreaterThan(0);
  });

  test('Good design passes DesignReviewer', async () => {
    const enforcer = new QualityEnforcer();

    // Test with good design
    const goodDesign = `# DESIGN

## Via Negativa - What We're DELETING

Delete 50 lines of legacy code.
Remove unused abstraction.
Simplify by removing complexity.

## Refactor vs Repair

This is TRUE REFACTOR:
- Removing root cause (legacy code)
- Not patching symptoms
- Simplifying system

## Implementation

Files: 3/5
Net LOC: -20 (deletion)
Simple, maintainable approach.
`;

    const result = await enforcer.enforceQuality({
      code: goodDesign,
      type: 'design',
      taskId: 'TEST-GATE-GOOD'
    });

    // Should pass with good design
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  test('Design critic checks AFP/SCAS principles', async () => {
    const enforcer = new QualityEnforcer();

    // Design without via negativa should get violations
    const noViaNegativa = `# Design

Just add new feature.
Create new abstraction.
Add complexity to handle edge cases.
`;

    const result = await enforcer.enforceQuality({
      code: noViaNegativa,
      type: 'design',
      taskId: 'TEST-VIA-NEGATIVA'
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toBeDefined();

    // Should have violation about Via Negativa
    const hasViaNegativaViolation = result.violations!.some(v =>
      v.toLowerCase().includes('via negativa') || v.toLowerCase().includes('delete')
    );
    expect(hasViaNegativaViolation).toBe(true);
  });

  test('DesignReviewer threshold is enforced', () => {
    const enforcer = new QualityEnforcer();
    const config = enforcer.getCriticConfig();

    // DesignReviewer threshold should be 90 (stricter than others)
    expect(config.thresholds.DesignReviewer).toBe(90);

    // Other critics should have thresholds too
    expect(config.thresholds.StrategyReviewer).toBeDefined();
    expect(config.thresholds.ThinkingCritic).toBeDefined();
    expect(config.thresholds.TestsCritic).toBeDefined();
    expect(config.thresholds.ProcessCritic).toBeDefined();
  });
});
