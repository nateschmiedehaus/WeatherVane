/**
 * ComplexityRouter Tests
 *
 * Validates complexity assessment and model selection logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ComplexityRouter } from './complexity_router.js';
import type { TaskEnvelope } from './task_envelope.js';

describe('ComplexityRouter', () => {
  let router: ComplexityRouter;

  beforeEach(() => {
    router = new ComplexityRouter();
  });

  describe('assessComplexity', () => {
    describe('simple tasks (score 0-3)', () => {
      it('scores task with no complexity factors as 0', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Fix typo',
          description: 'Change "teh" to "the"',
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(0);
        expect(complexity.factors).toHaveLength(0);
        expect(complexity.reasoning).toContain('Simple task');
      });

      it('scores task with short description as simple', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Update config',
          description: 'Add new environment variable',
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBeLessThanOrEqual(3);
      });
    });

    describe('individual complexity factors', () => {
      it('adds score for dependencies (weight: 2)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Refactor module',
          description: 'Update module',
          metadata: {
            dependencies: ['T2', 'T3'],
          },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(4); // 2 deps * weight 2
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'dependencies',
            value: 2,
            weight: 2,
            contribution: 4,
          })
        );
      });

      it('adds score for epic task (weight: 2)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Implement feature',
          description: 'Build new feature',
          metadata: {
            epic_id: 'EPIC1',
          },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(2);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'epic_task',
            weight: 2,
            contribution: 2,
          })
        );
      });

      it('adds score for parent task (weight: 2)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Subtask',
          description: 'Part of larger task',
          metadata: {
            parent_id: 'PARENT1',
          },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(2);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'epic_task',
            weight: 2,
          })
        );
      });

      it('adds score for long description (weight: 2)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Complex feature',
          description: 'A'.repeat(600), // > 500 chars
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(2);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'long_description',
            weight: 2,
            contribution: 2,
          })
        );
      });

      it('adds score for ML work (weight: 3)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Train model',
          description: 'Build ML pipeline',
          metadata: { requires_ml: true },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(3);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'ml_work',
            weight: 3,
            contribution: 3,
          })
        );
      });

      it('adds score for security impact (weight: 3)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Update auth',
          description: 'Fix authentication',
          metadata: { affects_security: true },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(3);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'security_impact',
            weight: 3,
            contribution: 3,
          })
        );
      });

      it('adds score for public API (weight: 2)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Add endpoint',
          description: 'Create new API endpoint',
          metadata: { public_api: true },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(2);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'public_api',
            weight: 2,
            contribution: 2,
          })
        );
      });

      it('adds score for cross-domain work (weight: 1)', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Integrate systems',
          description: 'Connect multiple domains',
          metadata: { cross_domain: true },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(1);
        expect(complexity.factors).toContainEqual(
          expect.objectContaining({
            name: 'cross_domain',
            weight: 1,
            contribution: 1,
          })
        );
      });
    });

    describe('multiple factors (additive)', () => {
      it('combines multiple factors additively', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Complex refactor',
          description: 'A'.repeat(600),
          metadata: {
            dependencies: ['T2', 'T3', 'T4'],
            requires_ml: true,
            affects_security: true,
          },
        };

        const complexity = router.assessComplexity(task);

        // 3 deps * 2 = 6
        // long_description = 2
        // ml_work = 3
        // security_impact = 3
        // Total = 14, clamped to 10
        expect(complexity.score).toBe(10);
        expect(complexity.factors).toHaveLength(4);
      });

      it('calculates score as sum of factor contributions', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Moderate task',
          description: 'Medium complexity',
          metadata: {
            dependencies: ['T2'],
            epic_id: 'EPIC1',
          },
        };

        const complexity = router.assessComplexity(task);

        // 1 dep * 2 = 2
        // epic_task = 2
        // Total = 4
        expect(complexity.score).toBe(4);
      });
    });

    describe('score clamping', () => {
      it('clamps score at maximum 10', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Mega complex',
          description: 'A'.repeat(1000),
          metadata: {
            dependencies: ['T2', 'T3', 'T4', 'T5'],
            epic_id: 'EPIC1',
            requires_ml: true,
            affects_security: true,
            public_api: true,
            cross_domain: true,
          },
        };

        const complexity = router.assessComplexity(task);

        // Raw score would be: 4*2 + 2 + 2 + 3 + 3 + 2 + 1 = 21
        // But should clamp at 10
        expect(complexity.score).toBe(10);
      });
    });

    describe('edge cases', () => {
      it('handles task with undefined description', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'No description',
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(0);
      });

      it('handles task with undefined metadata', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'No metadata',
          description: 'Simple task',
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(0);
      });

      it('handles task with empty dependencies array', () => {
        const task: TaskEnvelope = {
          id: 'T1',
          title: 'Empty deps',
          description: 'Task with no deps',
          metadata: {
            dependencies: [],
          },
        };

        const complexity = router.assessComplexity(task);

        expect(complexity.score).toBe(0);
        expect(complexity.factors.some((f) => f.name === 'dependencies')).toBe(false);
      });
    });
  });

  describe('selectModel', () => {
    describe('tier selection', () => {
      it('selects Haiku for score 0', () => {
        const complexity = { score: 0, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.model).toBe('claude-haiku-4.5');
        expect(selection.provider).toBe('anthropic');
        expect(selection.capabilityTags).toContain('fast_code');
        expect(selection.capabilityTags).toContain('cheap_batch');
        expect(selection.source).toBe('policy');
      });

      it('selects Haiku for score 1-3', () => {
        for (const score of [1, 2, 3]) {
          const complexity = { score, factors: [], reasoning: '' };
          const selection = router.selectModel(complexity);

          expect(selection.model).toBe('claude-haiku-4.5');
        }
      });

      it('selects Sonnet 3.5 for score 4', () => {
        const complexity = { score: 4, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.model).toBe('claude-3-5-sonnet-20241022');
        expect(selection.provider).toBe('anthropic');
        expect(selection.capabilityTags).toContain('fast_code');
        expect(selection.source).toBe('policy');
      });

      it('selects Sonnet 3.5 for score 4-6', () => {
        for (const score of [4, 5, 6]) {
          const complexity = { score, factors: [], reasoning: '' };
          const selection = router.selectModel(complexity);

          expect(selection.model).toBe('claude-3-5-sonnet-20241022');
        }
      });

      it('selects Sonnet 4.5 for score 7', () => {
        const complexity = { score: 7, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.model).toBe('claude-sonnet-4.5');
        expect(selection.provider).toBe('anthropic');
        expect(selection.capabilityTags).toContain('reasoning_high');
        expect(selection.source).toBe('policy');
      });

      it('selects Sonnet 4.5 for score 7-9', () => {
        for (const score of [7, 8, 9]) {
          const complexity = { score, factors: [], reasoning: '' };
          const selection = router.selectModel(complexity);

          expect(selection.model).toBe('claude-sonnet-4.5');
          expect(selection.capabilityTags).toContain('reasoning_high');
        }
      });

      it('selects Sonnet 4.5 with long context for score 10', () => {
        const complexity = { score: 10, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.model).toBe('claude-sonnet-4.5');
        expect(selection.provider).toBe('anthropic');
        expect(selection.capabilityTags).toContain('reasoning_high');
        expect(selection.capabilityTags).toContain('long_context');
        expect(selection.source).toBe('policy');
      });
    });

    describe('tier boundaries', () => {
      it('transitions from Haiku to Sonnet 3.5 at score 4', () => {
        const complexity3 = { score: 3, factors: [], reasoning: '' };
        const complexity4 = { score: 4, factors: [], reasoning: '' };

        const selection3 = router.selectModel(complexity3);
        const selection4 = router.selectModel(complexity4);

        expect(selection3.model).toBe('claude-haiku-4.5');
        expect(selection4.model).toBe('claude-3-5-sonnet-20241022');
      });

      it('transitions from Sonnet 3.5 to Sonnet 4.5 at score 7', () => {
        const complexity6 = { score: 6, factors: [], reasoning: '' };
        const complexity7 = { score: 7, factors: [], reasoning: '' };

        const selection6 = router.selectModel(complexity6);
        const selection7 = router.selectModel(complexity7);

        expect(selection6.model).toBe('claude-3-5-sonnet-20241022');
        expect(selection7.model).toBe('claude-sonnet-4.5');
      });

      it('adds long_context at score 10', () => {
        const complexity9 = { score: 9, factors: [], reasoning: '' };
        const complexity10 = { score: 10, factors: [], reasoning: '' };

        const selection9 = router.selectModel(complexity9);
        const selection10 = router.selectModel(complexity10);

        expect(selection9.capabilityTags).toContain('reasoning_high');
        expect(selection9.capabilityTags).not.toContain('long_context');
        expect(selection10.capabilityTags).toContain('long_context');
      });
    });

    describe('override handling', () => {
      it('honors model override', () => {
        const complexity = { score: 2, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity, 'claude-sonnet-4.5');

        expect(selection.model).toBe('claude-sonnet-4.5');
        expect(selection.source).toBe('policy');
        expect(selection.reason).toContain('Manual override');
        expect(selection.reason).toContain('complexity 2');
      });

      it('uses override even for simple tasks', () => {
        const complexity = { score: 0, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity, 'claude-sonnet-4.5');

        expect(selection.model).toBe('claude-sonnet-4.5');
        expect(selection.source).toBe('policy');
      });

      it('includes override model in capability tags when tier found', () => {
        const complexity = { score: 5, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity, 'claude-haiku-4.5');

        expect(selection.model).toBe('claude-haiku-4.5');
        expect(selection.capabilityTags).toContain('fast_code');
        expect(selection.capabilityTags).toContain('cheap_batch');
      });

      it('uses fallback tags when override model not in tiers', () => {
        const complexity = { score: 5, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity, 'gpt-4');

        expect(selection.model).toBe('gpt-4');
        expect(selection.capabilityTags).toEqual(['reasoning_high']);
      });
    });

    describe('rationale generation', () => {
      it('includes tier name in rationale', () => {
        const complexity = { score: 2, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.reason).toContain('simple');
        expect(selection.reason).toContain('score 2');
        expect(selection.reason).toContain('claude-haiku-4.5');
      });

      it('describes moderate tier correctly', () => {
        const complexity = { score: 5, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.reason).toContain('moderate');
        expect(selection.reason).toContain('score 5');
        expect(selection.reason).toContain('claude-3-5-sonnet-20241022');
      });

      it('describes complex tier correctly', () => {
        const complexity = { score: 8, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.reason).toContain('complex');
        expect(selection.reason).toContain('score 8');
        expect(selection.reason).toContain('claude-sonnet-4.5');
      });

      it('describes critical tier correctly', () => {
        const complexity = { score: 10, factors: [], reasoning: '' };
        const selection = router.selectModel(complexity);

        expect(selection.reason).toContain('critical');
        expect(selection.reason).toContain('score 10');
        expect(selection.reason).toContain('claude-sonnet-4.5');
      });
    });
  });

  describe('integration scenarios', () => {
    it('routes simple bug fix to Haiku', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Fix typo in error message',
        description: 'Change "occured" to "occurred"',
      };

      const complexity = router.assessComplexity(task);
      const selection = router.selectModel(complexity);

      expect(complexity.score).toBe(0);
      expect(selection.model).toBe('claude-haiku-4.5');
    });

    it('routes moderate feature to Sonnet 3.5', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Add logging to service',
        description: 'A'.repeat(600),
        metadata: {
          dependencies: ['T2'],
        },
      };

      const complexity = router.assessComplexity(task);
      const selection = router.selectModel(complexity);

      // long_description (2) + 1 dep (2) = 4
      expect(complexity.score).toBe(4);
      expect(selection.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('routes security-critical refactor to Sonnet 4.5', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Refactor authentication system',
        description: 'A'.repeat(600),
        metadata: {
          dependencies: ['T2', 'T3'],
          affects_security: true,
          public_api: true,
        },
      };

      const complexity = router.assessComplexity(task);
      const selection = router.selectModel(complexity);

      // 2 deps (4) + long_description (2) + security (3) + public_api (2) = 11, clamped to 10
      expect(complexity.score).toBeGreaterThanOrEqual(7);
      expect(selection.model).toBe('claude-sonnet-4.5');
    });

    it('routes ML pipeline work to Sonnet 4.5', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Build ML training pipeline',
        description: 'A'.repeat(800),
        metadata: {
          epic_id: 'ML_EPIC',
          dependencies: ['T2', 'T3', 'T4'],
          requires_ml: true,
          cross_domain: true,
        },
      };

      const complexity = router.assessComplexity(task);
      const selection = router.selectModel(complexity);

      // 3 deps (6) + epic (2) + long_description (2) + ml (3) + cross_domain (1) = 14, clamped to 10
      expect(complexity.score).toBe(10);
      expect(selection.model).toBe('claude-sonnet-4.5');
      expect(selection.capabilityTags).toContain('long_context');
    });

    it('respects manual override for critical tasks', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Quick fix',
        description: 'Simple change',
      };

      const complexity = router.assessComplexity(task);
      const selection = router.selectModel(complexity, 'claude-sonnet-4.5');

      expect(complexity.score).toBe(0); // Simple task
      expect(selection.model).toBe('claude-sonnet-4.5'); // But overridden
      expect(selection.source).toBe('policy');
    });
  });

  describe('custom configuration', () => {
    it('supports custom factor weights', () => {
      const customRouter = new ComplexityRouter({
        factorWeights: {
          dependencies: 5, // Higher weight
        },
      });

      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Task with deps',
        description: 'Simple task',
        metadata: {
          dependencies: ['T2'],
        },
      };

      const complexity = customRouter.assessComplexity(task);

      // 1 dep * custom weight 5 = 5
      expect(complexity.score).toBe(5);
    });

    it('supports custom model tiers', () => {
      const customRouter = new ComplexityRouter({
        modelTiers: [
          {
            maxScore: 5,
            model: 'custom-model',
            provider: 'custom',
            tier: 'simple',
            estimatedCost: 0.001,
            capabilityTags: ['cheap_batch'],
          },
          {
            maxScore: 10,
            model: 'claude-sonnet-4.5',
            provider: 'anthropic',
            tier: 'complex',
            estimatedCost: 0.03,
            capabilityTags: ['reasoning_high'],
          },
        ],
      });

      const complexity = { score: 3, factors: [], reasoning: '' };
      const selection = customRouter.selectModel(complexity);

      expect(selection.model).toBe('custom-model');
      expect(selection.capabilityTags).toContain('cheap_batch');
    });
  });

  describe('reasoning explanations', () => {
    it('provides human-readable reasoning for simple tasks', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Simple task',
        description: 'Quick fix',
      };

      const complexity = router.assessComplexity(task);

      expect(complexity.reasoning).toContain('Simple task');
      expect(complexity.reasoning).toContain('no complexity factors');
    });

    it('lists top contributing factors', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Complex task',
        description: 'A'.repeat(600),
        metadata: {
          dependencies: ['T2', 'T3'],
          requires_ml: true,
        },
      };

      const complexity = router.assessComplexity(task);

      expect(complexity.reasoning).toContain('dependencies');
      expect(complexity.reasoning).toContain('ml_work');
      expect(complexity.reasoning).toContain('long_description');
    });

    it('limits reasoning to top 3 factors', () => {
      const task: TaskEnvelope = {
        id: 'T1',
        title: 'Very complex task',
        description: 'A'.repeat(600),
        metadata: {
          dependencies: ['T2', 'T3', 'T4'],
          epic_id: 'EPIC1',
          requires_ml: true,
          affects_security: true,
          public_api: true,
          cross_domain: true,
        },
      };

      const complexity = router.assessComplexity(task);

      // Should only list top 3 factors by contribution
      const factorCount = (complexity.reasoning.match(/\+\d+/g) || []).length;
      expect(factorCount).toBeLessThanOrEqual(3);
    });
  });
});
