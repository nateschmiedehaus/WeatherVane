/**
 * Plan Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ModelSelection } from '../../model_router.js';
import type { PlannerAgent } from '../../planner_agent.js';
import { runPlan, type PlanRunnerDeps, type PlanRunnerContext } from '../../state_runners/plan_runner.js';

describe('PlanRunner - Behavior Tests', () => {
  let context: PlanRunnerContext;
  let deps: PlanRunnerDeps;
  let planner: PlannerAgent;

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

    const baseResult = {
      planHash: 'abc123def456',
      summary: 'Test plan summary',
      requiresThinker: false,
      planDeltaToken: 'delta-token',
      model: modelSelection,
      coverageTarget: 0.82,
    };

    planner = {
      run: vi.fn(() => Promise.resolve(baseResult)),
    } as unknown as PlannerAgent;

    deps = { planner };
  });

  // 1. HAPPY PATH - What should happen
  describe('when plan succeeds without thinker', () => {
    it('produces plan artifact', async () => {
      const result = await runPlan(context, deps);

      expect(result.artifacts.plan).toBeDefined();
      expect((result.artifacts.plan as any).planHash).toBe('abc123def456');
    });

    it('transitions to implement state', async () => {
      const result = await runPlan(context, deps);

      expect(result.nextState).toBe('implement');
    });

    it('returns success=true', async () => {
      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes plan hash in notes', async () => {
      const result = await runPlan(context, deps);

      expect(result.notes).toContain('Plan hash abc123de recorded.');
    });

    it('includes model selection', async () => {
      const result = await runPlan(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-high');
    });

    it('clears requirePlanDelta flag', async () => {
      context.requirePlanDelta = true;
      context.previousPlanHash = 'oldHash123';
      planner.run = vi.fn(() => Promise.resolve({
        planHash: 'newHash456',
        summary: 'New plan',
        requiresThinker: false,
        planDeltaToken: 'delta-new',
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
        coverageTarget: 0.85,
      }));

      const result = await runPlan(context, deps);

      expect(result.requirePlanDelta).toBe(false);
    });
  });

  // 2. THINKER REQUIRED PATHS
  describe('when planner requires thinker', () => {
    beforeEach(() => {
      planner.run = vi.fn(() => Promise.resolve({
        planHash: 'abc123def456',
        summary: 'Complex plan requiring exploration',
        requiresThinker: true,
        planDeltaToken: 'delta-token',
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
        coverageTarget: 0.82,
      }));
    });

    it('transitions to thinker state', async () => {
      const result = await runPlan(context, deps);

      expect(result.nextState).toBe('thinker');
    });

    it('sets requireThinker flag', async () => {
      const result = await runPlan(context, deps);

      expect(result.requireThinker).toBe(true);
    });
  });

  describe('when pending thinker is forced', () => {
    beforeEach(() => {
      context.pendingThinker = true;
    });

    it('transitions to thinker state even if planner does not require it', async () => {
      const result = await runPlan(context, deps);

      expect(result.nextState).toBe('thinker');
    });

    it('includes note about resolution requiring thinker', async () => {
      const result = await runPlan(context, deps);

      expect(result.notes).toContain('Resolution requires Thinker exploration before next patch.');
    });

    it('sets requireThinker flag', async () => {
      const result = await runPlan(context, deps);

      expect(result.requireThinker).toBe(true);
    });
  });

  // 3. PLAN DELTA LOGIC
  describe('when plan delta is required', () => {
    it('accepts new plan hash', async () => {
      context.requirePlanDelta = true;
      context.previousPlanHash = 'oldHash123';
      planner.run = vi.fn(() => Promise.resolve({
        planHash: 'newHash456',
        summary: 'Revised plan',
        requiresThinker: false,
        planDeltaToken: 'delta-revised',
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
        coverageTarget: 0.82,
      }));

      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
      expect(result.nextState).toBe('implement');
    });

    it('rejects unchanged plan hash', async () => {
      context.requirePlanDelta = true;
      context.previousPlanHash = 'sameHash123';
      planner.run = vi.fn(() => Promise.resolve({
        planHash: 'sameHash123',
        summary: 'Same plan',
        requiresThinker: false,
        planDeltaToken: 'delta-same',
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
        coverageTarget: 0.82,
      }));

      await expect(runPlan(context, deps)).rejects.toThrow('Plan delta required but plan hash unchanged');
    });

    it('allows unchanged hash if plan delta is not required', async () => {
      // requirePlanDelta not set
      context.previousPlanHash = 'sameHash123';
      planner.run = vi.fn(() => Promise.resolve({
        planHash: 'sameHash123',
        summary: 'Same plan',
        requiresThinker: false,
        planDeltaToken: 'delta-same',
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
        coverageTarget: 0.82,
      }));

      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
    });
  });

  // 4. SPIKE BRANCH TRACKING
  describe('when spike branch is active', () => {
    it('includes spike branch in notes', async () => {
      context.spikeBranch = 'spike/test-feature';

      const result = await runPlan(context, deps);

      expect(result.notes).toContain('Spike branch active: spike/test-feature');
    });

    it('preserves spike branch in result', async () => {
      context.spikeBranch = 'spike/test-feature';

      const result = await runPlan(context, deps);

      expect(result.spikeBranch).toBe('spike/test-feature');
    });
  });

  // 5. ERROR PATHS
  describe('when planner throws error', () => {
    it('propagates error', async () => {
      planner.run = vi.fn(() => {
        throw new Error('Planner failed');
      });

      await expect(runPlan(context, deps)).rejects.toThrow('Planner failed');
    });
  });

  // 6. EDGE CASES
  describe('edge cases', () => {
    it('handles missing requirePlanDelta flag', async () => {
      // context.requirePlanDelta is undefined
      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles missing previousPlanHash', async () => {
      context.requirePlanDelta = true;
      // context.previousPlanHash is undefined

      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles missing pendingThinker flag', async () => {
      // context.pendingThinker is undefined
      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
      expect(result.nextState).toBe('implement');
    });

    it('handles missing spikeBranch', async () => {
      // context.spikeBranch is undefined
      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
      expect(result.notes).not.toContain('Spike branch');
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runPlan(context, deps);

      expect(result.success).toBe(true);
    });

    it('passes requireDelta flag to planner', async () => {
      context.requirePlanDelta = true;

      await runPlan(context, deps);

      expect(planner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          requireDelta: true,
        })
      );
    });
  });
});
