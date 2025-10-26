/**
 * Specify Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runSpecify, type SpecifyRunnerDeps } from '../../state_runners/specify_runner.js';
import type { RunnerContext } from '../../state_runners/runner_types.js';
import type { SupervisorAgent } from '../../supervisor.js';
import type { ModelSelection } from '../../model_router.js';

describe('SpecifyRunner - Behavior Tests', () => {
  let context: RunnerContext;
  let deps: SpecifyRunnerDeps;
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
      specify: vi.fn(() => ({
        acceptanceCriteria: ['criterion 1', 'criterion 2', 'criterion 3'],
        initialRisks: ['risk 1'],
        model: modelSelection,
      })),
    } as unknown as SupervisorAgent;

    deps = { supervisor };
  });

  // 1. HAPPY PATH - What should happen
  describe('when specify succeeds', () => {
    it('produces acceptance criteria', async () => {
      const result = await runSpecify(context, deps);

      expect(result.artifacts.specify).toBeDefined();
      expect((result.artifacts.specify as any).acceptanceCriteria).toHaveLength(3);
    });

    it('transitions to plan state', async () => {
      const result = await runSpecify(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=true', async () => {
      const result = await runSpecify(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes model selection', async () => {
      const result = await runSpecify(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-high');
    });

    it('includes notes about criteria count', async () => {
      const result = await runSpecify(context, deps);

      expect(result.notes).toContain('Acceptance criteria recorded: 3');
    });
  });

  // 2. ERROR PATHS - What should happen when things go wrong
  describe('when supervisor throws error', () => {
    it('propagates error', async () => {
      supervisor.specify = vi.fn(() => {
        throw new Error('Supervisor failed');
      });

      await expect(runSpecify(context, deps)).rejects.toThrow('Supervisor failed');
    });
  });

  // 3. EDGE CASES - Boundary conditions
  describe('edge cases', () => {
    it('handles empty acceptance criteria', async () => {
      supervisor.specify = vi.fn(() => ({
        acceptanceCriteria: [],
        initialRisks: [],
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      const result = await runSpecify(context, deps);

      expect(result.artifacts.specify).toBeDefined();
      expect((result.artifacts.specify as any).acceptanceCriteria).toEqual([]);
      expect(result.nextState).toBe('plan'); // Still proceeds
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runSpecify(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runSpecify(context, deps);

      expect(result.success).toBe(true);
    });
  });
});
