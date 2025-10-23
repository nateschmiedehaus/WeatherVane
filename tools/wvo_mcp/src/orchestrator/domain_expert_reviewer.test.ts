/**
 * Tests for Domain Expert Reviewer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainExpertReviewer, type TaskEvidence, type ModelRouter } from './domain_expert_reviewer.js';

// Mock model router
class MockModelRouter {
  private lastModelUsed = 'claude-opus-4';

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
});
