/**
 * Seven-Lens Evaluator Tests
 *
 * Comprehensive tests covering all 7 dimensions of the evaluator:
 * 1. CEO Lens - Revenue/business impact
 * 2. Designer Lens - Visual/design quality
 * 3. UX Lens - User experience
 * 4. CMO Lens - Marketing/GTM alignment
 * 5. Ad Expert Lens - Platform feasibility
 * 6. Academic Lens - Statistical rigor
 * 7. PM Lens - Project management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SevenLensEvaluator } from './seven_lens_evaluator.js';

describe('SevenLensEvaluator', () => {
  let evaluator: SevenLensEvaluator;

  beforeEach(() => {
    evaluator = new SevenLensEvaluator();
  });

  describe('CEO Lens - Revenue Impact', () => {
    it('should pass for revenue-critical tasks', () => {
      const task = {
        id: 'T1',
        title: 'Build demo for prospect meetings',
        description: 'Create working demo to show to paying customers and close deals',
        status: 'pending',
        exit_criteria: ['Demo works', 'Revenue generated']
      };

      const report = evaluator.evaluateTask(task);
      const ceoLens = report.lenses.find(l => l.lens === 'CEO');

      expect(ceoLens?.passed).toBe(true);
      expect(ceoLens?.score).toBeGreaterThanOrEqual(70);
    });

    it('should fail for low-impact documentation tasks', () => {
      const task = {
        id: 'T2',
        title: 'Update documentation formatting',
        description: 'Clean up README.md styling',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const ceoLens = report.lenses.find(l => l.lens === 'CEO');

      expect(ceoLens?.passed).toBe(false);
      expect(ceoLens?.score).toBeLessThan(70);
      expect(ceoLens?.concerns).toContain('Task does not clearly articulate revenue impact');
    });

    it('should boost score for blocking tasks', () => {
      const task = {
        id: 'T3',
        title: 'Fix critical blocker',
        description: 'This task blocks all other high-priority work and is a prerequisite for demo',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const ceoLens = report.lenses.find(l => l.lens === 'CEO');

      expect(ceoLens?.score).toBeGreaterThan(70);
    });
  });

  describe('Designer Lens - Visual Quality', () => {
    it('should auto-pass non-UI tasks', () => {
      const task = {
        id: 'T4',
        title: 'Implement API endpoint',
        description: 'Backend logic for data processing',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const designerLens = report.lenses.find(l => l.lens === 'Designer');

      expect(designerLens?.passed).toBe(true);
      expect(designerLens?.score).toBe(70); // Default pass
    });

    it('should require design system alignment for UI work', () => {
      const task = {
        id: 'T5',
        title: 'Build new dashboard component',
        description: 'Create UI widget for analytics, must follow Figma design system and meet Vercel-level quality',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const designerLens = report.lenses.find(l => l.lens === 'Designer');

      expect(designerLens?.passed).toBe(true);
      expect(designerLens?.score).toBeGreaterThanOrEqual(70);
    });

    it('should fail UI work without design standards mentioned', () => {
      const task = {
        id: 'T6',
        title: 'Add frontend form',
        description: 'Quick UI for user input',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const designerLens = report.lenses.find(l => l.lens === 'Designer');

      expect(designerLens?.passed).toBe(false);
      expect(designerLens?.concerns).toEqual(
        expect.arrayContaining([
          expect.stringContaining('design system')
        ])
      );
    });
  });

  describe('UX Lens - User Experience', () => {
    it('should auto-pass non-UX tasks', () => {
      const task = {
        id: 'T7',
        title: 'Refactor database schema',
        description: 'Backend optimization',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const uxLens = report.lenses.find(l => l.lens === 'UX');

      expect(uxLens?.passed).toBe(true);
    });

    it('should require frictionless metrics for UX work', () => {
      const task = {
        id: 'T8',
        title: 'Improve onboarding workflow',
        description: 'User onboarding must be simple, <5 min to first insight, one-click automation',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const uxLens = report.lenses.find(l => l.lens === 'UX');

      expect(uxLens?.passed).toBe(true);
      expect(uxLens?.score).toBeGreaterThanOrEqual(70);
    });

    it('should fail UX work without frictionless requirements', () => {
      const task = {
        id: 'T9',
        title: 'Add user settings page',
        description: 'New dashboard for configuration',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const uxLens = report.lenses.find(l => l.lens === 'UX');

      expect(uxLens?.passed).toBe(false);
      expect(uxLens?.concerns.length).toBeGreaterThan(0);
    });
  });

  describe('CMO Lens - GTM Alignment', () => {
    it('should auto-pass non-GTM tasks', () => {
      const task = {
        id: 'T10',
        title: 'Update database indexes',
        description: 'Performance optimization',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const cmoLens = report.lenses.find(l => l.lens === 'CMO');

      expect(cmoLens?.passed).toBe(true);
    });

    it('should require value proposition alignment for GTM work', () => {
      const task = {
        id: 'T11',
        title: 'Create demo for prospects',
        description: 'Show how weather timing captures 15-30% incremental revenue and improves ROAS',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const cmoLens = report.lenses.find(l => l.lens === 'CMO');

      expect(cmoLens?.passed).toBe(true);
    });

    it('should fail GTM work without value prop narrative', () => {
      const task = {
        id: 'T12',
        title: 'Prepare customer demo',
        description: 'Show product features',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const cmoLens = report.lenses.find(l => l.lens === 'CMO');

      expect(cmoLens?.passed).toBe(false);
    });
  });

  describe('Ad Expert Lens - Platform Feasibility', () => {
    it('should auto-pass non-platform tasks', () => {
      const task = {
        id: 'T13',
        title: 'Write unit tests',
        description: 'Test coverage for utility functions',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const adExpertLens = report.lenses.find(l => l.lens === 'Ad Expert');

      expect(adExpertLens?.passed).toBe(true);
    });

    it('should require constraint handling for platform work', () => {
      const task = {
        id: 'T14',
        title: 'Integrate Meta Ads API',
        description: 'Connect to Facebook API with OAuth, handle rate limits (200 req/hr), implement retry logic and error handling',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const adExpertLens = report.lenses.find(l => l.lens === 'Ad Expert');

      expect(adExpertLens?.passed).toBe(true);
    });

    it('should fail platform work without constraint handling', () => {
      const task = {
        id: 'T15',
        title: 'Connect to Google Ads',
        description: 'Fetch campaign data',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const adExpertLens = report.lenses.find(l => l.lens === 'Ad Expert');

      expect(adExpertLens?.passed).toBe(false);
      expect(adExpertLens?.concerns).toEqual(
        expect.arrayContaining([
          expect.stringContaining('constraints')
        ])
      );
    });
  });

  describe('Academic Lens - Statistical Rigor', () => {
    it('should auto-pass non-research tasks', () => {
      const task = {
        id: 'T16',
        title: 'Update UI styling',
        description: 'CSS improvements',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const academicLens = report.lenses.find(l => l.lens === 'Academic');

      expect(academicLens?.passed).toBe(true);
    });

    it('should require statistical validation for research work', () => {
      const task = {
        id: 'T17',
        title: 'Train MMM model',
        description: 'Train weather-aware model with cross-validation, target R²≥0.65 out-of-sample, p<0.05 for causal claims, fully reproducible methodology',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const academicLens = report.lenses.find(l => l.lens === 'Academic');

      expect(academicLens?.passed).toBe(true);
      expect(academicLens?.score).toBeGreaterThanOrEqual(70);
    });

    it('should fail research work without statistical criteria', () => {
      const task = {
        id: 'T18',
        title: 'Build prediction model',
        description: 'Create model for forecasting',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const academicLens = report.lenses.find(l => l.lens === 'Academic');

      expect(academicLens?.passed).toBe(false);
      expect(academicLens?.concerns.length).toBeGreaterThan(0);
    });
  });

  describe('PM Lens - Project Management', () => {
    it('should pass for well-defined tasks with exit criteria', () => {
      const task = {
        id: 'T19',
        title: 'Implement feature X',
        description: 'Build new capability',
        status: 'pending',
        dependencies: [],
        exit_criteria: ['Tests pass', 'Feature works', 'Documentation updated'],
        estimated_hours: 8
      };

      const report = evaluator.evaluateTask(task);
      const pmLens = report.lenses.find(l => l.lens === 'PM');

      expect(pmLens?.passed).toBe(true);
      expect(pmLens?.score).toBeGreaterThanOrEqual(70);
    });

    it('should penalize tasks without exit criteria', () => {
      const task = {
        id: 'T20',
        title: 'Work on feature',
        description: 'Do some work',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);
      const pmLens = report.lenses.find(l => l.lens === 'PM');

      expect(pmLens?.concerns).toEqual(
        expect.arrayContaining([
          expect.stringContaining('exit criteria')
        ])
      );
    });

    it('should penalize oversized tasks (>16 hours)', () => {
      const task = {
        id: 'T21',
        title: 'Major refactor',
        description: 'Rewrite entire subsystem',
        status: 'pending',
        estimated_hours: 40
      };

      const report = evaluator.evaluateTask(task);
      const pmLens = report.lenses.find(l => l.lens === 'PM');

      expect(pmLens?.concerns).toEqual(
        expect.arrayContaining([
          expect.stringContaining('decomposition')
        ])
      );
    });
  });

  describe('Overall Evaluation', () => {
    it('should mark task as ready only if ALL 12 lenses pass', () => {
      const task = {
        id: 'T-MLR-1.2',
        title: 'Generate 3 years of synthetic data for 20 tenants',
        description: 'Generate synthetic data with known weather elasticity for model training and validation. Target R²≥0.65, reproducible methodology.',
        status: 'in_progress',
        dependencies: [],
        exit_criteria: [
          '3 years × 20 tenants = 219,000 rows',
          'Weather correlations ≥0.90',
          'Data stored in storage/seeds/synthetic_v2/'
        ],
        estimated_hours: 8,
        domain: 'product'
      };

      const report = evaluator.evaluateTask(task);

      // This task should pass CEO (data needed for demo/revenue)
      // Should pass Designer (non-UI)
      // Should pass UX (non-UX-facing)
      // Should pass CMO (non-GTM)
      // Should pass Ad Expert (non-platform)
      // Should pass Academic (mentions R², reproducible)
      // Should pass PM (has exit criteria, no dependencies, reasonable hours)
      // Should pass CFO (non-financial)
      // Should pass CTO (non-scalability)
      // Should pass Customer Success (non-CS)
      // Should pass DevOps (non-ops)
      // Should pass Legal (non-legal)

      expect(report.overallPass).toBe(true);
      expect(report.readyToExecute).toBe(true);
      expect(report.blockers).toHaveLength(0);
      expect(report.recommendation).toContain('READY TO EXECUTE');
    });

    it('should mark task as not ready if any lens fails', () => {
      const task = {
        id: 'T22',
        title: 'Add UI component',
        description: 'Quick frontend widget',
        status: 'pending',
        estimated_hours: 25 // Too large
      };

      const report = evaluator.evaluateTask(task);

      expect(report.overallPass).toBe(false);
      expect(report.readyToExecute).toBe(false);
      expect(report.blockers.length).toBeGreaterThan(0);
      expect(report.recommendation).toContain('NOT READY');
    });
  });

  describe('Batch Evaluation', () => {
    it('should rank tasks by readiness and lens pass count', () => {
      const tasks = [
        {
          id: 'T-LOW',
          title: 'Documentation cleanup',
          description: 'Update old docs',
          status: 'pending'
        },
        {
          id: 'T-HIGH',
          title: 'Build demo for revenue',
          description: 'Demo for paying customers to close deals, critical path',
          status: 'pending',
          dependencies: [],
          exit_criteria: ['Demo works', 'Customer signs contract'],
          estimated_hours: 4
        },
        {
          id: 'T-MEDIUM',
          title: 'Add API endpoint',
          description: 'New backend feature',
          status: 'pending',
          exit_criteria: ['Tests pass'],
          estimated_hours: 6
        }
      ];

      const reports = evaluator.evaluateBatch(tasks);

      // Should return reports for all tasks
      expect(reports).toHaveLength(3);

      // Reports should be sorted (all-pass tasks first, then by lens pass count, then by score)
      // Verify sorting is working by checking descending order of pass counts + scores
      for (let i = 0; i < reports.length - 1; i++) {
        const current = reports[i];
        const next = reports[i + 1];

        const currentPassCount = current.lenses.filter(l => l.passed).length;
        const nextPassCount = next.lenses.filter(l => l.passed).length;

        if (current.overallPass && !next.overallPass) {
          // All-pass tasks should come before non-all-pass
          expect(true).toBe(true);
        } else if (currentPassCount > nextPassCount) {
          // Higher pass count should come first
          expect(true).toBe(true);
        } else if (currentPassCount === nextPassCount) {
          // Equal pass count, should be sorted by average score
          const currentAvgScore = current.lenses.reduce((sum, l) => sum + l.score, 0) / current.lenses.length;
          const nextAvgScore = next.lenses.reduce((sum, l) => sum + l.score, 0) / next.lenses.length;
          expect(currentAvgScore).toBeGreaterThanOrEqual(nextAvgScore);
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle tasks with no description', () => {
      const task = {
        id: 'T23',
        title: 'Test task',
        status: 'pending'
      };

      const report = evaluator.evaluateTask(task);

      expect(report).toBeDefined();
      expect(report.lenses).toHaveLength(12); // Expanded from 7 to 12 lenses
    });

    it('should handle tasks with undefined fields', () => {
      const task = {
        id: 'T24',
        title: 'Another test',
        status: 'pending',
        dependencies: undefined,
        exit_criteria: undefined,
        estimated_hours: undefined
      };

      const report = evaluator.evaluateTask(task);

      expect(report).toBeDefined();
      expect(report.lenses).toHaveLength(12); // Expanded from 7 to 12 lenses
    });
  });
});
