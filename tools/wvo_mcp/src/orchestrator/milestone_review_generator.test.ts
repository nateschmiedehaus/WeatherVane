/**
 * Milestone Review Generator Tests
 *
 * Tests the automatic generation of 7 expert review tasks when milestones reach 80% completion.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import * as yaml from 'js-yaml';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MilestoneReviewGenerator } from './milestone_review_generator.js';

describe('MilestoneReviewGenerator', () => {
  let tempDir: string;
  let generator: MilestoneReviewGenerator;
  let roadmapPath: string;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = mkdtempSync(join(tmpdir(), 'milestone-test-'));
    const stateDir = join(tempDir, 'state');
    mkdirSync(stateDir, { recursive: true });
    roadmapPath = join(stateDir, 'roadmap.yaml');

    generator = new MilestoneReviewGenerator(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Milestone Completion Calculation', () => {
    it('should calculate 0% completion for milestone with no tasks', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: []
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const summary = generator.getMilestoneSummary();
      const milestone = summary.find(m => m.id === 'M1.0');

      expect(milestone?.completion).toBe(0);
    });

    it('should calculate 100% completion for milestone with all tasks done', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const summary = generator.getMilestoneSummary();
      const milestone = summary.find(m => m.id === 'M1.0');

      expect(milestone?.completion).toBe(1.0);
    });

    it('should calculate 80% completion correctly', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const summary = generator.getMilestoneSummary();
      const milestone = summary.find(m => m.id === 'M1.0');

      expect(milestone?.completion).toBe(0.8); // 4/5 = 80%
    });

    it('should exclude review tasks from completion calculation', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'pending' },
              { id: 'M1.0-Review-Technical', title: 'Technical Review', status: 'pending' }, // Should be excluded
              { id: 'M1.0-Review-Quality', title: 'Quality Review', status: 'pending' } // Should be excluded
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const summary = generator.getMilestoneSummary();
      const milestone = summary.find(m => m.id === 'M1.0');

      // Should be 2/3 = 66.67%, not 2/5 = 40% (review tasks excluded)
      expect(milestone?.completion).toBeCloseTo(0.667, 2);
    });
  });

  describe('Review Task Generation', () => {
    it('should generate 7 review tasks when milestone reaches 80%', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Data Pipeline',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const result = await generator.checkAndGenerateReviews();

      expect(result.generated).toBe(7); // 7 review tasks
      expect(result.milestones).toContain('M1.0');

      // Verify roadmap was updated
      const summary = generator.getMilestoneSummary();
      const milestone = summary.find(m => m.id === 'M1.0');

      expect(milestone?.hasReviews).toBe(true);
    });

    it('should not generate reviews if milestone < 80%', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'pending' },
              { id: 'T1.4', title: 'Task 4', status: 'pending' },
              { id: 'T1.5', title: 'Task 5', status: 'pending' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const result = await generator.checkAndGenerateReviews();

      expect(result.generated).toBe(0);
      expect(result.milestones).toHaveLength(0);
    });

    it('should not generate duplicate reviews', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' },
              // Reviews already exist
              { id: 'M1.0-Review-Technical', title: 'Technical Review', status: 'pending' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const result = await generator.checkAndGenerateReviews();

      expect(result.generated).toBe(0); // No new reviews generated
    });
  });

  describe('Review Task Content', () => {
    it('should generate tasks with all required lenses', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Model Validation',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      await generator.checkAndGenerateReviews();

      // Read updated roadmap
      const updatedContent = require('fs').readFileSync(roadmapPath, 'utf-8');
      const updatedRoadmap = yaml.load(updatedContent) as any;
      const milestone = updatedRoadmap.epics[0].milestones[0];

      // Check for all 7 review task types
      const reviewTasks = milestone.tasks.filter((t: any) => t.id.includes('-Review-'));
      const lensTypes = reviewTasks.map((t: any) => t.id.split('-Review-')[1]);

      expect(reviewTasks).toHaveLength(7);
      expect(lensTypes).toEqual(
        expect.arrayContaining([
          'Technical',
          'Quality',
          'Business',
          'UX',
          'Academic',
          'Risk',
          'GoNoGo'
        ])
      );
    });

    it('should include milestone context in review task descriptions', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Model Validation Complete',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      await generator.checkAndGenerateReviews();

      // Read updated roadmap
      const updatedContent = require('fs').readFileSync(roadmapPath, 'utf-8');
      const updatedRoadmap = yaml.load(updatedContent) as any;
      const milestone = updatedRoadmap.epics[0].milestones[0];

      const technicalReview = milestone.tasks.find((t: any) => t.id === 'M1.0-Review-Technical');

      expect(technicalReview).toBeDefined();
      expect(technicalReview.title).toContain('Model Validation Complete');
      expect(technicalReview.description).toContain('Model Validation Complete');
      expect(technicalReview.description).toContain('Milestone');
    });

    it('should assign owners to review tasks', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      await generator.checkAndGenerateReviews();

      // Read updated roadmap
      const updatedContent = require('fs').readFileSync(roadmapPath, 'utf-8');
      const updatedRoadmap = yaml.load(updatedContent) as any;
      const milestone = updatedRoadmap.epics[0].milestones[0];

      const businessReview = milestone.tasks.find((t: any) => t.id === 'M1.0-Review-Business');
      const qualityReview = milestone.tasks.find((t: any) => t.id === 'M1.0-Review-Quality');

      expect(businessReview?.owner).toContain('Director Dana');
      expect(qualityReview?.owner).toContain('Quality Critics');
    });

    it('should create review tasks with proper exit criteria', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [{
            id: 'M1.0',
            title: 'Milestone 1',
            status: 'pending',
            tasks: [
              { id: 'T1.1', title: 'Task 1', status: 'done' },
              { id: 'T1.2', title: 'Task 2', status: 'done' },
              { id: 'T1.3', title: 'Task 3', status: 'done' },
              { id: 'T1.4', title: 'Task 4', status: 'done' },
              { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
            ]
          }]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      await generator.checkAndGenerateReviews();

      // Read updated roadmap
      const updatedContent = require('fs').readFileSync(roadmapPath, 'utf-8');
      const updatedRoadmap = yaml.load(updatedContent) as any;
      const milestone = updatedRoadmap.epics[0].milestones[0];

      const technicalReview = milestone.tasks.find((t: any) => t.id === 'M1.0-Review-Technical');

      expect(technicalReview?.exit_criteria).toBeDefined();
      expect(technicalReview?.exit_criteria).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Build completes'),
          expect.stringContaining('tests pass')
        ])
      );
    });
  });

  describe('Multiple Milestones', () => {
    it('should generate reviews for multiple milestones if needed', async () => {
      const roadmap = {
        epics: [{
          id: 'E1',
          title: 'Epic 1',
          status: 'pending',
          domain: 'product',
          milestones: [
            {
              id: 'M1.0',
              title: 'Milestone 1',
              status: 'pending',
              tasks: [
                { id: 'T1.1', title: 'Task 1', status: 'done' },
                { id: 'T1.2', title: 'Task 2', status: 'done' },
                { id: 'T1.3', title: 'Task 3', status: 'done' },
                { id: 'T1.4', title: 'Task 4', status: 'done' },
                { id: 'T1.5', title: 'Task 5', status: 'in_progress' }
              ]
            },
            {
              id: 'M1.1',
              title: 'Milestone 2',
              status: 'pending',
              tasks: [
                { id: 'T2.1', title: 'Task 1', status: 'done' },
                { id: 'T2.2', title: 'Task 2', status: 'done' },
                { id: 'T2.3', title: 'Task 3', status: 'done' },
                { id: 'T2.4', title: 'Task 4', status: 'done' },
                { id: 'T2.5', title: 'Task 5', status: 'in_progress' }
              ]
            }
          ]
        }]
      };

      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const result = await generator.checkAndGenerateReviews();

      expect(result.generated).toBe(14); // 7 reviews × 2 milestones
      expect(result.milestones).toHaveLength(2);
      expect(result.milestones).toEqual(['M1.0', 'M1.1']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing roadmap gracefully', async () => {
      // Don't create roadmap file
      const result = await generator.checkAndGenerateReviews();

      expect(result.generated).toBe(0);
      expect(result.milestones).toHaveLength(0);
    });

    it('should handle empty roadmap', async () => {
      const roadmap = { epics: [] };
      writeFileSync(roadmapPath, yaml.dump(roadmap));

      const result = await generator.checkAndGenerateReviews();

      expect(result.generated).toBe(0);
      expect(result.milestones).toHaveLength(0);
    });
  });
});
