/**
 * PR Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runPr, type PrRunnerDeps } from '../../state_runners/pr_runner.js';
import type { RunnerContext } from '../../state_runners/runner_types.js';
import type { SupervisorAgent } from '../../supervisor.js';
import type { ModelSelection } from '../../model_router.js';

describe('PrRunner - Behavior Tests', () => {
  let context: RunnerContext;
  let deps: PrRunnerDeps;
  let supervisor: SupervisorAgent;

  beforeEach(() => {
    context = {
      task: {
        id: 'TEST-1',
        title: 'Test task',
        priorityTags: ['p0'],
      },
      attemptNumber: 1,
    };

    const modelSelection: ModelSelection = {
      model: 'codex-5-high',
      provider: 'anthropic',
      capabilityTags: ['reasoning_high'],
      source: 'policy' as const,
      reason: 'test',
    };

    supervisor = {
      preparePr: vi.fn(() => ({
        ready: true,
        checklist: ['All tests pass', 'Lint clean', 'Docs updated'],
        model: modelSelection,
      })),
    } as unknown as SupervisorAgent;

    deps = { supervisor };
  });

  // 1. HAPPY PATH - What should happen
  describe('when PR is ready', () => {
    it('produces pr artifact', async () => {
      const result = await runPr(context, deps);

      expect(result.artifacts.pr).toBeDefined();
      expect((result.artifacts.pr as any).ready).toBe(true);
    });

    it('transitions to monitor state', async () => {
      const result = await runPr(context, deps);

      expect(result.nextState).toBe('monitor');
    });

    it('returns success=true', async () => {
      const result = await runPr(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes satisfaction note', async () => {
      const result = await runPr(context, deps);

      expect(result.notes).toContain('PR checklist satisfied.');
    });

    it('includes model selection', async () => {
      const result = await runPr(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-high');
    });

    it('includes checklist in artifact', async () => {
      const result = await runPr(context, deps);

      expect((result.artifacts.pr as any).checklist).toHaveLength(3);
    });
  });

  // 2. PR NOT READY PATH
  describe('when PR is not ready', () => {
    beforeEach(() => {
      supervisor.preparePr = vi.fn(() => ({
        ready: false,
        checklist: ['Tests failing', 'Lint errors'],
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));
    });

    it('transitions to plan state', async () => {
      const result = await runPr(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runPr(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runPr(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('includes failure note', async () => {
      const result = await runPr(context, deps);

      expect(result.notes).toContain('PR checklist failed.');
    });
  });

  // 3. ERROR PATHS
  describe('when supervisor throws error', () => {
    it('propagates error', async () => {
      supervisor.preparePr = vi.fn(() => {
        throw new Error('Supervisor crashed');
      });

      await expect(runPr(context, deps)).rejects.toThrow('Supervisor crashed');
    });
  });

  // 4. EDGE CASES
  describe('edge cases', () => {
    it('handles empty checklist', async () => {
      supervisor.preparePr = vi.fn(() => ({
        ready: true,
        checklist: [],
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      const result = await runPr(context, deps);

      expect(result.success).toBe(true);
      expect((result.artifacts.pr as any).checklist).toEqual([]);
    });

    it('handles many checklist items', async () => {
      const manyItems = Array.from({ length: 50 }, (_, i) => `Item ${i + 1}`);
      supervisor.preparePr = vi.fn(() => ({
        ready: true,
        checklist: manyItems,
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      const result = await runPr(context, deps);

      expect(result.success).toBe(true);
      expect((result.artifacts.pr as any).checklist).toHaveLength(50);
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runPr(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runPr(context, deps);

      expect(result.success).toBe(true);
    });
  });
});
