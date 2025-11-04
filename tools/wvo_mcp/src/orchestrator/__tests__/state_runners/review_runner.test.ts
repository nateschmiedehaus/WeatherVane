/**
 * Review Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { CriticalAgent } from '../../critical_agent.js';
import type { ModelSelection } from '../../model_router.js';
import type { ReviewerAgent } from '../../reviewer_agent.js';
import { runReview, type ReviewRunnerDeps, type ReviewRunnerContext } from '../../state_runners/review_runner.js';

describe('ReviewRunner - Behavior Tests', () => {
  let context: ReviewRunnerContext;
  let deps: ReviewRunnerDeps;
  let reviewer: ReviewerAgent;
  let critical: CriticalAgent;

  beforeEach(() => {
    context = {
      task: {
        id: 'TEST-1',
        title: 'Test task',
        priorityTags: ['p0'],
      },
      attemptNumber: 1,
      patchHash: 'patch123abc',
      coverageDelta: 0.82,
    };

    const modelSelection: ModelSelection = {
      model: 'codex-5-high',
      provider: 'anthropic',
      capabilityTags: ['reasoning_high'],
      source: 'policy' as const,
      reason: 'test',
    };

    const rubric = {
      resolution_proof: 4,
      design: 4,
      performance_security: 4,
      maintainability: 4,
      executive_quality: 4,
    };

    reviewer = {
      review: vi.fn(() => Promise.resolve({
        approved: true,
        rubric,
        report: JSON.stringify({ approved: true }),
        model: modelSelection,
      })),
    } as unknown as ReviewerAgent;

    critical = {
      audit: vi.fn(() => Promise.resolve({
        issues: [],
        requiresEscalation: false,
      })),
    } as unknown as CriticalAgent;

    deps = { reviewer, critical };
  });

  // 1. HAPPY PATH - What should happen
  describe('when review approved and no critical issues', () => {
    it('produces review artifact', async () => {
      const result = await runReview(context, deps);

      expect(result.artifacts.review).toBeDefined();
      expect((result.artifacts.review as any).review.approved).toBe(true);
    });

    it('transitions to pr state', async () => {
      const result = await runReview(context, deps);

      expect(result.nextState).toBe('pr');
    });

    it('returns success=true', async () => {
      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes approval note', async () => {
      const result = await runReview(context, deps);

      expect(result.notes).toContain('Review approved and critical gate clean.');
    });

    it('includes model selection', async () => {
      const result = await runReview(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-high');
    });

    it('passes patch hash and coverage to reviewer', async () => {
      await runReview(context, deps);

      expect(reviewer.review).toHaveBeenCalledWith({
        task: context.task,
        patchHash: 'patch123abc',
        coverageDelta: 0.82,
      });
    });

    it('passes patch hash to critical', async () => {
      await runReview(context, deps);

      expect(critical.audit).toHaveBeenCalledWith({
        task: context.task,
        patchHash: 'patch123abc',
      });
    });
  });

  // 2. REVIEW REJECTION PATHS
  describe('when review is not approved', () => {
    beforeEach(() => {
      reviewer.review = vi.fn(() => Promise.resolve({
        approved: false,
        rubric: {
          resolution_proof: 2,
          design: 2,
          performance_security: 2,
          maintainability: 2,
          executive_quality: 2,
        },
        report: JSON.stringify({ approved: false }),
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
      const result = await runReview(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runReview(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runReview(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('includes failure note', async () => {
      const result = await runReview(context, deps);

      expect(result.notes).toContain('Review or critical gate failed; returning to Plan.');
    });
  });

  describe('when critical issues are found', () => {
    beforeEach(() => {
      critical.audit = vi.fn(() => Promise.resolve({
        issues: ['Security vulnerability', 'Performance bottleneck'],
        requiresEscalation: true,
      }));
    });

    it('transitions to plan state', async () => {
      const result = await runReview(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runReview(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runReview(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('includes critical issues in artifact', async () => {
      const result = await runReview(context, deps);

      expect((result.artifacts.review as any).critical.issues).toHaveLength(2);
    });
  });

  describe('when both review fails and critical issues found', () => {
    beforeEach(() => {
      reviewer.review = vi.fn(() => Promise.resolve({
        approved: false,
        rubric: {
          resolution_proof: 2,
          design: 2,
          performance_security: 2,
          maintainability: 2,
          executive_quality: 2,
        },
        report: JSON.stringify({ approved: false }),
        model: {
          model: 'codex-5-high',
          provider: 'anthropic',
          capabilityTags: [],
          source: 'policy' as const,
          reason: 'test',
        },
      }));

      critical.audit = vi.fn(() => Promise.resolve({
        issues: ['Security vulnerability'],
        requiresEscalation: true,
      }));
    });

    it('transitions to plan state', async () => {
      const result = await runReview(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runReview(context, deps);

      expect(result.success).toBe(false);
    });
  });

  // 3. ERROR PATHS
  describe('when patch hash is missing', () => {
    it('throws error', async () => {
      context.patchHash = '' as any;

      await expect(runReview(context, deps)).rejects.toThrow('Review requires patch hash from previous implement state');
    });

    it('throws error when patchHash is undefined', async () => {
      delete (context as any).patchHash;

      await expect(runReview(context, deps)).rejects.toThrow('Review requires patch hash from previous implement state');
    });
  });

  describe('when reviewer throws error', () => {
    it('propagates error', async () => {
      reviewer.review = vi.fn(() => {
        throw new Error('Reviewer crashed');
      });

      await expect(runReview(context, deps)).rejects.toThrow('Reviewer crashed');
    });
  });

  describe('when critical throws error', () => {
    it('propagates error', async () => {
      critical.audit = vi.fn(() => {
        throw new Error('Critical crashed');
      });

      await expect(runReview(context, deps)).rejects.toThrow('Critical crashed');
    });
  });

  // 4. EDGE CASES
  describe('edge cases', () => {
    it('handles zero coverage delta', async () => {
      context.coverageDelta = 0;

      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles negative coverage delta', async () => {
      context.coverageDelta = -0.05;

      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles high coverage delta', async () => {
      context.coverageDelta = 1.0;

      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles empty critical issues array', async () => {
      critical.audit = vi.fn(() => Promise.resolve({
        issues: [],
        requiresEscalation: false,
      }));

      const result = await runReview(context, deps);

      expect(result.success).toBe(true);
      expect(result.nextState).toBe('pr');
    });

    it('handles single critical issue', async () => {
      critical.audit = vi.fn(() => Promise.resolve({
        issues: ['One issue'],
        requiresEscalation: true,
      }));

      const result = await runReview(context, deps);

      expect(result.success).toBe(false);
      expect(result.nextState).toBe('plan');
    });
  });
});
