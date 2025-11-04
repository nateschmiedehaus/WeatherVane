/**
 * Implement Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ImplementerAgent, ImplementerAgentResult } from '../../implementer_agent.js';
import type { ModelSelection } from '../../model_router.js';
import { runImplement, type ImplementRunnerDeps, type ImplementRunnerContext } from '../../state_runners/implement_runner.js';

describe('ImplementRunner - Behavior Tests', () => {
  let context: ImplementRunnerContext;
  let deps: ImplementRunnerDeps;
  let implementer: ImplementerAgent;

  beforeEach(() => {
    context = {
      task: {
        id: 'TEST-1',
        title: 'Test task',
        priorityTags: ['p0'],
      },
      attemptNumber: 1,
      planHash: 'abc123def456',
      insights: ['Insight 1', 'Insight 2'],
    };

    const modelSelection: ModelSelection = {
      model: 'codex-5-fast',
      provider: 'anthropic',
      capabilityTags: ['fast_code'],
      source: 'policy' as const,
      reason: 'test',
    };

    implementer = {
      apply: vi.fn(
        (): Promise<ImplementerAgentResult> =>
          Promise.resolve({
            success: true,
            patchHash: 'patch123abc',
            notes: [],
            coverageHint: 0.8,
            changedFiles: [{ path: 'src/file1.ts' }],
            changedLinesCoverage: 85,
            touchedFilesDelta: 1,
            failingProofProvided: false,
            mutationSmokeEnabled: false,
            model: modelSelection,
          })
      ),
    } as unknown as ImplementerAgent;

    deps = { implementer };
  });

  // 1. HAPPY PATH - What should happen
  describe('when implementation succeeds', () => {
    it('produces implement artifact', async () => {
      const result = await runImplement(context, deps);

      expect(result.artifacts.implement).toBeDefined();
      expect((result.artifacts.implement as any).patchHash).toBe('patch123abc');
    });

    it('transitions to verify state', async () => {
      const result = await runImplement(context, deps);

      expect(result.nextState).toBe('verify');
    });

    it('returns success=true', async () => {
      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes patch hash in notes', async () => {
      const result = await runImplement(context, deps);

      expect(result.notes).toContain('Patch patch123 emitted.');
    });

    it('includes model selection', async () => {
      const result = await runImplement(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-fast');
    });

    it('passes plan hash and insights to implementer', async () => {
      await runImplement(context, deps);

      expect(implementer.apply).toHaveBeenCalledWith({
        task: context.task,
        planHash: 'abc123def456',
        insights: ['Insight 1', 'Insight 2'],
      });
    });
  });

  // 2. IMPLEMENTATION FAILURE PATH
  describe('when implementation fails', () => {
    beforeEach(() => {
      implementer.apply = vi.fn(
        (): Promise<ImplementerAgentResult> =>
          Promise.resolve({
            success: false,
            patchHash: '',
            notes: [],
            coverageHint: 0,
            changedFiles: [],
            changedLinesCoverage: 0,
            touchedFilesDelta: 0,
            failingProofProvided: false,
            mutationSmokeEnabled: false,
            model: {
              model: 'codex-5-fast',
              provider: 'anthropic',
              capabilityTags: [],
              source: 'policy' as const,
              reason: 'test',
            },
          })
      );
    });

    it('transitions to plan state', async () => {
      const result = await runImplement(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runImplement(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runImplement(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('includes failure note', async () => {
      const result = await runImplement(context, deps);

      expect(result.notes).toContain('Implementation failed, returning to plan.');
    });
  });

  // 3. DUPLICATE PATCH DETECTION
  describe('when duplicate patch is detected', () => {
    beforeEach(() => {
      context.patchHistory = new Set(['patch123abc']);
    });

    it('transitions to plan state', async () => {
      const result = await runImplement(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runImplement(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runImplement(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('includes duplicate note', async () => {
      const result = await runImplement(context, deps);

      expect(result.notes).toContain('Duplicate patch patch123 detected.');
    });
  });

  describe('when patch is not duplicate', () => {
    beforeEach(() => {
      context.patchHistory = new Set(['differentPatch456']);
    });

    it('succeeds and transitions to verify', async () => {
      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
      expect(result.nextState).toBe('verify');
    });
  });

  // 4. ERROR PATHS
  describe('when plan hash is missing', () => {
    it('throws error', async () => {
      context.planHash = '' as any;

      await expect(runImplement(context, deps)).rejects.toThrow('Implement requires plan hash from previous plan state');
    });

    it('throws error when planHash is undefined', async () => {
      delete (context as any).planHash;

      await expect(runImplement(context, deps)).rejects.toThrow('Implement requires plan hash from previous plan state');
    });
  });

  describe('when implementer throws error', () => {
    it('propagates error', async () => {
      implementer.apply = vi.fn(() => {
        throw new Error('Implementer crashed');
      });

      await expect(runImplement(context, deps)).rejects.toThrow('Implementer crashed');
    });
  });

  // 5. EDGE CASES
  describe('edge cases', () => {
    it('handles missing insights', async () => {
      delete (context as any).insights;

      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
      expect(implementer.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          insights: [],
        })
      );
    });

    it('handles empty insights array', async () => {
      context.insights = [];

      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles missing patch history', async () => {
      // context.patchHistory is undefined
      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
      expect(result.nextState).toBe('verify');
    });

    it('handles empty patch history', async () => {
      context.patchHistory = new Set();

      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
      expect(result.nextState).toBe('verify');
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles long patch hash', async () => {
      implementer.apply = vi.fn(
        (): Promise<ImplementerAgentResult> =>
          Promise.resolve({
            success: true,
            patchHash: 'a'.repeat(100),
            notes: [],
            coverageHint: 0.8,
            changedFiles: [{ path: 'src/file1.ts' }],
            changedLinesCoverage: 85,
            touchedFilesDelta: 1,
            failingProofProvided: false,
            mutationSmokeEnabled: false,
            model: {
              model: 'codex-5-fast',
              provider: 'anthropic',
              capabilityTags: [],
              source: 'policy' as const,
              reason: 'test',
            },
          })
      );

      const result = await runImplement(context, deps);

      expect(result.success).toBe(true);
      expect(result.notes[0]).toContain('Patch aaaaaaaa emitted.'); // First 8 chars
    });
  });
});
