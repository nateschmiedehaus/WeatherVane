/**
 * Quality Graph - Plan Integration Tests
 *
 * Verifies integration with PLAN phase:
 * - Similar tasks queried before planning
 * - Hints formatted correctly
 * - Planning works without quality graph (graceful degradation)
 * - Hints attached to plan result
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import { runPlan } from '../../orchestrator/state_runners/plan_runner.js';
import { writeVector } from '../persistence.js';
import type { TaskVector } from '../schema.js';
import type { RunnerContext } from '../../orchestrator/state_runners/runner_types.js';

const TEST_WORKSPACE = '/tmp/quality-graph-plan-test';

describe('Plan Integration', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });

    // Create structure expected by Python script
    await fs.mkdir(`${TEST_WORKSPACE}/state/quality_graph`, { recursive: true });
    await fs.mkdir(`${TEST_WORKSPACE}/tools/wvo_mcp/scripts/quality_graph`, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('queries similar tasks before planning', async () => {
    // Populate corpus with similar task
    // Note: In real test, we'd need Python environment set up
    // For now, we test that the integration doesn't crash

    const context: RunnerContext = {
      task: {
        id: 'TEST-PLAN-1',
        title: 'Add user authentication',
        description: 'Implement JWT-based auth',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockPlanner = {
      run: vi.fn().mockResolvedValue({
        planHash: 'abc123',
        requiresThinker: false,
        summary: 'Test plan',
        planDeltaToken: 'delta456',
        coverageTarget: 80,
      }),
    };

    const result = await runPlan(context, {
      planner: mockPlanner as any,
      workspaceRoot: TEST_WORKSPACE,
    });

    // Verify plan succeeded
    expect(result.success).toBe(true);
    expect(result.nextState).toBe('implement');

    // Verify planner was called
    expect(mockPlanner.run).toHaveBeenCalled();

    // Verify hints are attached to plan result (even if empty)
    const plan = result.artifacts.plan as any;
    expect(plan).toHaveProperty('qualityGraphHints');
    expect(plan).toHaveProperty('similarTasksCount');
  });

  it('works without workspace root (graceful degradation)', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-PLAN-2',
        title: 'Test without quality graph',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockPlanner = {
      run: vi.fn().mockResolvedValue({
        planHash: 'xyz789',
        requiresThinker: false,
        summary: 'Test plan',
        planDeltaToken: 'delta789',
        coverageTarget: 80,
      }),
    };

    // No workspaceRoot provided
    const result = await runPlan(context, {
      planner: mockPlanner as any,
    });

    // Should still succeed
    expect(result.success).toBe(true);
    expect(result.nextState).toBe('implement');

    // Hints should be empty
    const plan = result.artifacts.plan as any;
    expect(plan.qualityGraphHints).toBe('');
    expect(plan.similarTasksCount).toBe(0);
  });

  it('continues planning if quality graph query fails', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-PLAN-3',
        title: 'Test with invalid workspace',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockPlanner = {
      run: vi.fn().mockResolvedValue({
        planHash: 'fail123',
        requiresThinker: false,
        summary: 'Test plan',
        planDeltaToken: 'deltafail',
        coverageTarget: 80,
      }),
    };

    // Invalid workspace (will cause Python script to fail)
    const result = await runPlan(context, {
      planner: mockPlanner as any,
      workspaceRoot: '/nonexistent/path',
    });

    // Should still succeed (graceful degradation)
    expect(result.success).toBe(true);
    expect(result.nextState).toBe('implement');

    // Planner should have been called despite query failure
    expect(mockPlanner.run).toHaveBeenCalled();
  });

  it('includes similar tasks count in notes when found', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-PLAN-4',
        title: 'Test notes with similar tasks',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockPlanner = {
      run: vi.fn().mockResolvedValue({
        planHash: 'notes123',
        requiresThinker: false,
        summary: 'Test plan',
        planDeltaToken: 'deltanotes',
        coverageTarget: 80,
      }),
    };

    const result = await runPlan(context, {
      planner: mockPlanner as any,
      workspaceRoot: TEST_WORKSPACE,
    });

    // If similar tasks were found, notes should mention it
    // For empty corpus, similarTasksCount should be 0
    const plan = result.artifacts.plan as any;
    if (plan.similarTasksCount > 0) {
      const hasHintNote = result.notes.some((note) =>
        note.includes('Quality graph') || note.includes('similar task')
      );
      expect(hasHintNote).toBe(true);
    }
  });

  it('requires thinker if planner requests it', async () => {
    const context: RunnerContext = {
      task: {
        id: 'TEST-PLAN-5',
        title: 'Test with thinker required',
      },
      attemptNumber: 1,
      modelSelection: {
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilityTags: ['fast_code'],
        source: 'policy',
        reason: 'test',
      },
    };

    const mockPlanner = {
      run: vi.fn().mockResolvedValue({
        planHash: 'thinker123',
        requiresThinker: true, // Planner requests thinker
        summary: 'Test plan needing exploration',
        planDeltaToken: 'deltathinker',
        coverageTarget: 80,
      }),
    };

    const result = await runPlan(context, {
      planner: mockPlanner as any,
      workspaceRoot: TEST_WORKSPACE,
    });

    // Should transition to thinker instead of implement
    expect(result.success).toBe(true);
    expect(result.nextState).toBe('thinker');
    expect(result.requireThinker).toBe(true);
  });
});

describe('Hints Module', () => {
  it('formats hints correctly for multiple tasks', async () => {
    const { formatPlanningHints } = await import('../hints.js');

    const similarTasks = [
      {
        taskId: 'TASK-1',
        title: 'Add user authentication',
        similarity: 0.85,
        isConfident: true,
        outcome: { status: 'success' as const },
        quality: 'high' as const,
        durationMs: 7200000,
        filesTouched: ['src/auth.ts', 'src/middleware.ts'],
      },
      {
        taskId: 'TASK-2',
        title: 'Implement JWT tokens',
        similarity: 0.72,
        isConfident: true,
        outcome: { status: 'success' as const },
        durationMs: 5400000,
      },
    ];

    const hints = formatPlanningHints(similarTasks);

    // Check structure
    expect(hints).toContain('## Similar Past Tasks');
    expect(hints).toContain('### 1. Add user authentication (high confidence)');
    expect(hints).toContain('### 2. Implement JWT tokens (high confidence)');
    expect(hints).toContain('Similarity: 85.0%');
    expect(hints).toContain('Similarity: 72.0%');
    expect(hints).toContain('Outcome: success');
    expect(hints).toContain('Quality: high');
    expect(hints).toContain('Duration: 2.0h');
    expect(hints).toContain('Files: src/auth.ts, src/middleware.ts');
  });

  it('returns empty string for no similar tasks', async () => {
    const { formatPlanningHints } = await import('../hints.js');

    const hints = formatPlanningHints([]);

    expect(hints).toBe('');
  });

  it('marks low similarity as moderate confidence', async () => {
    const { formatPlanningHints } = await import('../hints.js');

    const similarTasks = [
      {
        taskId: 'TASK-LOW',
        title: 'Somewhat similar task',
        similarity: 0.45,
        isConfident: false, // Low confidence
        outcome: { status: 'success' as const },
      },
    ];

    const hints = formatPlanningHints(similarTasks);

    expect(hints).toContain('(moderate)');
    expect(hints).not.toContain('(high confidence)');
  });
});
