/**
 * Test: REVIEW tasks must complete full AFP lifecycle (no bypass)
 *
 * This test verifies that the REVIEW task bypass has been removed.
 * Previously, REVIEW tasks completed in 0.5 seconds with fake evidence.
 * Now, they must complete the full AFP 10-phase lifecycle.
 */

import { describe, it as test, expect, beforeAll, afterAll } from 'vitest';
import { AutonomousRunner } from '../autonomous_runner.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Bypass Removal', () => {
  const testStateDir = path.join(process.cwd(), 'test_state_no_bypass');
  let runner: AutonomousRunner;

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

    runner = new AutonomousRunner(testStateDir);
  });

  afterAll(async () => {
    // Clean up
    await fs.rm(testStateDir, { recursive: true, force: true });
  });

  test('REVIEW tasks must complete full AFP lifecycle', async () => {
    const task = {
      id: 'TEST-REVIEW-TASK',
      title: 'Test Review Task',
      status: 'pending' as const,
      description: 'Test that REVIEW tasks no longer bypass quality gates',
      dependencies: [],
      exit_criteria: []
    };

    const startTime = Date.now();
    const result = await (runner as any).executeTaskWithAI(task);
    const executionTime = Date.now() - startTime;

    // Must NOT complete in < 1 second (bypass took 0.5 sec)
    expect(executionTime).toBeGreaterThan(1000);

    // Must have real evidence, not just completion.md
    const evidenceDir = path.join(testStateDir, 'evidence', task.id);

    // Check for AFP lifecycle evidence
    const strategyExists = await fs.access(path.join(evidenceDir, 'strategy.md')).then(() => true).catch(() => false);
    const specExists = await fs.access(path.join(evidenceDir, 'spec.md')).then(() => true).catch(() => false);
    const planExists = await fs.access(path.join(evidenceDir, 'plan.md')).then(() => true).catch(() => false);

    expect(strategyExists).toBe(true);
    expect(specExists).toBe(true);
    expect(planExists).toBe(true);

    // Evidence must be from MCP, not templates
    if (strategyExists) {
      const strategy = await fs.readFile(path.join(evidenceDir, 'strategy.md'), 'utf8');
      expect(strategy).not.toContain('Generic template');
      expect(strategy).not.toContain('Auto-completed by autonomous runner');
      expect(strategy.length).toBeGreaterThan(500); // Real evidence is longer
    }
  }, 60000); // 60 second timeout for full lifecycle

  test('No completion.md-only bypass', async () => {
    const task = {
      id: 'TEST-REVIEW-TASK-2',
      title: 'Another Review Task',
      status: 'pending' as const,
      description: 'Verify no shortcut to completion.md',
      dependencies: [],
      exit_criteria: []
    };

    await (runner as any).executeTaskWithAI(task);

    const evidenceDir = path.join(testStateDir, 'evidence', task.id);

    // Should have MORE than just completion.md
    const files = await fs.readdir(evidenceDir);
    expect(files.length).toBeGreaterThan(1);

    // Should have phase evidence
    const hasPhaseEvidence = files.some(f =>
      f === 'strategy.md' || f === 'spec.md' || f === 'plan.md'
    );
    expect(hasPhaseEvidence).toBe(true);
  }, 60000);
});
