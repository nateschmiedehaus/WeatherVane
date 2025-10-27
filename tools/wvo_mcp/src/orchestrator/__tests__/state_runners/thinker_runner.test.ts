/**
 * Thinker Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ModelSelection } from '../../model_router.js';
import { runThinker, type ThinkerRunnerDeps, type ThinkerRunnerContext } from '../../state_runners/thinker_runner.js';
import type { ThinkerAgent } from '../../thinker_agent.js';

describe('ThinkerRunner - Behavior Tests', () => {
  let context: ThinkerRunnerContext;
  let deps: ThinkerRunnerDeps;
  let thinker: ThinkerAgent;

  beforeEach(() => {
    context = {
      task: {
        id: 'TEST-1',
        title: 'Test task',
        priorityTags: ['p0'],
      },
      attemptNumber: 1,
      planHash: 'abc123def456',
    };

    const modelSelection: ModelSelection = {
      model: 'codex-5-high',
      provider: 'anthropic',
      capabilityTags: ['reasoning_high'],
      source: 'policy' as const,
      reason: 'test',
    };

    thinker = {
      reflect: vi.fn(() => Promise.resolve({
        insights: ['Insight 1', 'Insight 2', 'Insight 3'],
        escalationRecommended: false,
        model: modelSelection,
      })),
    } as unknown as ThinkerAgent;

    deps = { thinker };
  });

  // 1. HAPPY PATH - What should happen
  describe('when thinker succeeds', () => {
    it('produces thinker artifact with insights', async () => {
      const result = await runThinker(context, deps);

      expect(result.artifacts.thinker).toBeDefined();
      expect((result.artifacts.thinker as any).insights).toHaveLength(3);
    });

    it('transitions to implement state', async () => {
      const result = await runThinker(context, deps);

      expect(result.nextState).toBe('implement');
    });

    it('returns success=true', async () => {
      const result = await runThinker(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes insight count in notes', async () => {
      const result = await runThinker(context, deps);

      expect(result.notes).toContain('Thinker added 3 insights.');
    });

    it('includes model selection', async () => {
      const result = await runThinker(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-high');
    });

    it('passes plan hash to thinker', async () => {
      await runThinker(context, deps);

      expect(thinker.reflect).toHaveBeenCalledWith({
        task: context.task,
        planHash: 'abc123def456',
      });
    });
  });

  // 2. ERROR PATHS - What should happen when things go wrong
  describe('when plan hash is missing', () => {
    it('throws error', async () => {
      context.planHash = '' as any;

      await expect(runThinker(context, deps)).rejects.toThrow('Thinker requires plan hash from previous plan state');
    });

    it('throws error when planHash is undefined', async () => {
      delete (context as any).planHash;

      await expect(runThinker(context, deps)).rejects.toThrow('Thinker requires plan hash from previous plan state');
    });
  });

  describe('when thinker throws error', () => {
    it('propagates error', async () => {
      thinker.reflect = vi.fn(() => {
        throw new Error('Thinker failed');
      });

      await expect(runThinker(context, deps)).rejects.toThrow('Thinker failed');
    });
  });

  // 3. EDGE CASES - Boundary conditions
  describe('edge cases', () => {
    it('handles zero insights', async () => {
      thinker.reflect = vi.fn(() => Promise.resolve({
        insights: [],
        escalationRecommended: false,
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      const result = await runThinker(context, deps);

      expect(result.artifacts.thinker).toBeDefined();
      expect((result.artifacts.thinker as any).insights).toEqual([]);
      expect(result.notes).toContain('Thinker added 0 insights.');
    });

    it('handles many insights', async () => {
      const manyInsights = Array.from({ length: 100 }, (_, i) => `Insight ${i + 1}`);
      thinker.reflect = vi.fn(() => Promise.resolve({
        insights: manyInsights,
        escalationRecommended: false,
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      const result = await runThinker(context, deps);

      expect((result.artifacts.thinker as any).insights).toHaveLength(100);
      expect(result.notes).toContain('Thinker added 100 insights.');
    });

    it('handles escalation recommendation', async () => {
      thinker.reflect = vi.fn(() => Promise.resolve({
        insights: ['Critical insight'],
        escalationRecommended: true,
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      const result = await runThinker(context, deps);

      expect((result.artifacts.thinker as any).escalationRecommended).toBe(true);
      expect(result.success).toBe(true); // Still succeeds, escalation is just a flag
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runThinker(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runThinker(context, deps);

      expect(result.success).toBe(true);
    });
  });
});
