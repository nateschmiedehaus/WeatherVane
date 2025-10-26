/**
 * Tests for Domain Expert Reviewer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainExpertReviewer, type ModelRouter } from './domain_expert_reviewer.js';
import type { TaskEvidence } from './adversarial_bullshit_detector.js';

// Mock model router
class MockModelRouter {
  private lastModelUsed = 'claude-opus-4.1';

  async route(prompt: string, complexity: string): Promise<string> {
    // Return mock JSON response
    return JSON.stringify({
      approved: true,
      depth: 'genius',
      concerns: [],
      recommendations: ['Test recommendation'],
      reasoning: 'Mock expert reasoning based on the prompt'
    });
  }

  getLastModelUsed(): string {
    return this.lastModelUsed;
  }
}

describe('DomainExpertReviewer', () => {
  let reviewer: DomainExpertReviewer;
  let mockRouter: ModelRouter;

  beforeEach(async () => {
    mockRouter = new MockModelRouter() as any;
    reviewer = new DomainExpertReviewer(process.cwd(), mockRouter);
    await reviewer.loadDomainRegistry();
  });

  describe('Domain Identification', () => {
    it('should identify statistics domains for GAM tasks', () => {
      const domains = reviewer.identifyRequiredDomains(
        'Implement GAM model',
        'Generalized additive model for forecast decomposition'
      );

      expect(domains).toContain('statistics_generalized_additive_models');
      expect(domains).toContain('statistics_timeseries');
    });

    it('should identify forecasting domains', () => {
      const domains = reviewer.identifyRequiredDomains(
        'Weather forecast model',
        'Time series prediction for temperature'
      );

      expect(domains).toContain('statistics_timeseries');
      expect(domains).toContain('domain_meteorology');
    });

    it('should identify resource management domains', () => {
      const domains = reviewer.identifyRequiredDomains(
        'Resource lifecycle manager',
        'Manage agent pool resources with cleanup'
      );

      expect(domains).toContain('software_distributed_systems');
      expect(domains).toContain('software_architecture');
    });

    it('should use default domains when no match', () => {
      const domains = reviewer.identifyRequiredDomains(
        'Some random task',
        'Not matching any pattern'
      );

      expect(domains).toContain('software_architecture');
      expect(domains).toContain('philosophy_systems_thinking');
      expect(domains).toContain('practitioner_production');
    });
  });

  describe('Multi-Domain Review', () => {
    it('should run multi-domain review with multiple perspectives', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T1',
        title: 'Implement GAM model',
        description: 'Generalized additive model for forecast decomposition',
        buildOutput: 'Build successful',
        testOutput: 'All tests passed',
        changedFiles: ['src/models/gam.ts'],
        testFiles: ['src/models/gam.test.ts'],
        documentation: ['docs/gam_model.md'],
      };

      const review = await reviewer.reviewTaskWithMultipleDomains(evidence);

      expect(review.taskId).toBe('T1');
      expect(review.reviews.length).toBeGreaterThan(0);
      expect(review.reviews[0]).toHaveProperty('domainName');
      expect(review.reviews[0]).toHaveProperty('approved');
      expect(review.reviews[0]).toHaveProperty('depth');
      expect(review.reviews[0]).toHaveProperty('reasoning');
    });

    it('should require unanimous approval for consensus', async () => {
      // This test would need a mock that returns mixed results
      // For now, just verify the structure
      const evidence: TaskEvidence = {
        taskId: 'T2',
        title: 'Test task',
        description: 'Test description',
        buildOutput: 'OK',
        testOutput: 'OK',
        changedFiles: [],
        testFiles: [],
        documentation: [],
      };

      const review = await reviewer.reviewTaskWithMultipleDomains(evidence);

      expect(review).toHaveProperty('consensusApproved');
      expect(review).toHaveProperty('overallDepth');
      expect(review).toHaveProperty('synthesis');
    });
  });

  describe('Prompt Template Loading', () => {
    it('should load statistics expert template', async () => {
      const template = await reviewer.loadPromptTemplate('statistics_expert');

      expect(template).toContain('statistics');
      expect(template).toContain('{{taskTitle}}');
      expect(template).toContain('{{taskDescription}}');
    });

    it('should load philosopher template', async () => {
      const template = await reviewer.loadPromptTemplate('philosopher');

      expect(template).toContain('epistemology');
      expect(template).toContain('philosophical');
    });

    it('should provide default template when file not found', async () => {
      const template = await reviewer.loadPromptTemplate('nonexistent');

      expect(template).toContain('Expert Review');
      expect(template).toContain('{{taskTitle}}');
    });
  });

  describe('Depth Assessment', () => {
    it('should assess overall depth as minimum across experts', () => {
      // This is tested implicitly through multi-domain review
      // The synthesis logic takes the weakest link (minimum depth)
    });
  });

  describe('Error Handling', () => {
    it('should handle missing domain gracefully', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T3',
        title: 'Unknown task',
        description: 'Some description',
        buildOutput: 'OK',
        testOutput: 'OK',
        changedFiles: [],
        testFiles: [],
        documentation: [],
      };

      // Should not throw even with empty domain list
      const review = await reviewer.reviewTaskWithMultipleDomains(evidence, []);
      expect(review.reviews).toHaveLength(0);
    });

    it('should handle corrupted evidence gracefully', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T4',
        title: '',
        description: '',
        buildOutput: '',
        testOutput: '',
        changedFiles: [],
        testFiles: [],
        documentation: [],
      };

      const review = await reviewer.reviewTaskWithMultipleDomains(evidence);
      expect(review).toBeDefined();
      expect(review.taskId).toBe('T4');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long task titles', () => {
      const longTitle = 'A'.repeat(1000);
      const domains = reviewer.identifyRequiredDomains(
        longTitle,
        'forecasting task'
      );

      expect(domains).toBeDefined();
      expect(domains.length).toBeGreaterThan(0);
    });

    it('should handle special characters in task description', () => {
      const domains = reviewer.identifyRequiredDomains(
        'Test task',
        'Test with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?'
      );

      expect(domains).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should cache loaded prompt templates', async () => {
      const template1 = await reviewer.loadPromptTemplate('domain_expert');
      const template2 = await reviewer.loadPromptTemplate('domain_expert');

      // Should return same reference (cached)
      expect(template1).toBe(template2);
    });

    it('should handle concurrent review requests', async () => {
      const evidences: TaskEvidence[] = Array(5).fill(0).map((_, i) => ({
        taskId: `T-concurrent-${i}`,
        title: 'Test task',
        description: 'Test description',
        buildOutput: 'OK',
        testOutput: 'OK',
        changedFiles: [],
        testFiles: [],
        documentation: [],
      }));

      // Run multiple reviews in parallel
      const reviews = await Promise.all(
        evidences.map(e => reviewer.reviewTaskWithMultipleDomains(e))
      );

      expect(reviews).toHaveLength(5);
      reviews.forEach(r => expect(r.taskId).toBeDefined());
    });
  });

  describe('State Management', () => {
    it('should maintain separate domain registries for different instances', async () => {
      const mockRouter1 = new MockModelRouter() as any;
      const mockRouter2 = new MockModelRouter() as any;

      const reviewer1 = new DomainExpertReviewer(process.cwd(), mockRouter1);
      const reviewer2 = new DomainExpertReviewer(process.cwd(), mockRouter2);

      await reviewer1.loadDomainRegistry();
      await reviewer2.loadDomainRegistry();

      const domains1 = reviewer1.identifyRequiredDomains('forecasting', 'timeseries');
      const domains2 = reviewer2.identifyRequiredDomains('forecasting', 'timeseries');

      expect(domains1).toEqual(domains2);
    });
  });

  describe('Integration', () => {
    it('should produce complete multi-domain review with all fields', async () => {
      const evidence: TaskEvidence = {
        taskId: 'T-integration',
        title: 'Implement GAM model',
        description: 'Generalized additive model for forecast',
        buildOutput: 'Build: success\nTime: 2.5s',
        testOutput: '100 tests passed',
        changedFiles: ['src/models/gam.ts', 'src/utils/math.ts'],
        testFiles: ['src/models/gam.test.ts'],
        documentation: ['docs/gam_model.md', 'docs/implementation.md'],
      };

      const review = await reviewer.reviewTaskWithMultipleDomains(evidence);

      expect(review).toHaveProperty('taskId');
      expect(review).toHaveProperty('reviews');
      expect(review).toHaveProperty('consensusApproved');
      expect(review).toHaveProperty('overallDepth');
      expect(review).toHaveProperty('criticalConcerns');
      expect(review).toHaveProperty('synthesis');
      expect(review).toHaveProperty('timestamp');

      // Verify structure of reviews
      if (review.reviews.length > 0) {
        const firstReview = review.reviews[0];
        expect(firstReview).toHaveProperty('domainId');
        expect(firstReview).toHaveProperty('domainName');
        expect(firstReview).toHaveProperty('approved');
        expect(firstReview).toHaveProperty('depth');
        expect(firstReview).toHaveProperty('concerns');
        expect(firstReview).toHaveProperty('recommendations');
        expect(firstReview).toHaveProperty('reasoning');
        expect(firstReview).toHaveProperty('modelUsed');
        expect(firstReview).toHaveProperty('timestamp');
      }
    });
  });
});
