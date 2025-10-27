/**
 * Milestone Review Generator
 *
 * Automatically generates 7 expert review tasks when a milestone reaches 80% completion.
 * Ensures all major milestones pass through multi-disciplinary review before proceeding.
 *
 * **Triggered by**: Orchestrator monitoring milestone completion percentage
 * **Generates**: 7 review tasks (Technical, Quality, Business, UX, Academic, Risk, Go/No-Go)
 * **Owner assignment**: Routes to appropriate experts (Director Dana, critics, PM)
 *
 * See: docs/ARCHITECTURE.md - Milestone Review Requirements
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

import * as yaml from 'js-yaml';

import { logInfo, logWarning } from '../telemetry/logger.js';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  description?: string;
  dependencies?: string[];
  exit_criteria?: string[];
  domain?: string;
  owner?: string;
}

interface Milestone {
  id: string;
  title: string;
  status: string;
  tasks: Task[];
}

interface Epic {
  id: string;
  title: string;
  status: string;
  domain: string;
  milestones: Milestone[];
}

interface Roadmap {
  epics: Epic[];
}

interface ReviewTaskTemplate {
  lens: string;
  title_suffix: string;
  description: string;
  owner: string;
  exit_criteria: string[];
}

const REVIEW_TASK_TEMPLATES: ReviewTaskTemplate[] = [
  {
    lens: 'Technical',
    title_suffix: 'Technical Review',
    description: 'Verify all exit criteria met: build passes with 0 errors, all tests pass, features work as specified, no regressions introduced.',
    owner: 'Autopilot (technical validation)',
    exit_criteria: [
      'Build completes with 0 errors (npm run build)',
      'All tests pass (npm test)',
      'Features work end-to-end (manual + automated verification)',
      'No regressions in existing functionality'
    ]
  },
  {
    lens: 'Quality',
    title_suffix: 'Quality Review',
    description: 'Run all quality critics: tests critic, security audit (npm audit), performance checks, design_system review if UI changes.',
    owner: 'Quality Critics (automated)',
    exit_criteria: [
      'Tests critic passes (coverage ≥80%, all 7 dimensions tested)',
      'Security audit shows 0 vulnerabilities (npm audit)',
      'Performance benchmarks within acceptable range',
      'Design system critic passes if UI changes present'
    ]
  },
  {
    lens: 'Business',
    title_suffix: 'Business Alignment Review (CEO Lens)',
    description: 'Confirm this milestone unblocks revenue path and aligns with primary business objectives: (1) Get to paying customers, (2) Prove weather impact, (3) Real data ingestion, (4) Autonomous operation.',
    owner: 'Director Dana (executive)',
    exit_criteria: [
      'Milestone demonstrably unblocks revenue-critical path',
      'Deliverables align with ≥1 primary business objective',
      'Success metrics defined and measurable',
      'Business case validated (ROI > cost)'
    ]
  },
  {
    lens: 'UX',
    title_suffix: 'User Experience Review',
    description: 'Validate user experience meets world-class standards: frictionless (<5min to first insight), no training required, intuitive workflows, clear value proposition.',
    owner: 'UX Reviewer (human or UX critic)',
    exit_criteria: [
      'Time to first insight <5 minutes (onboarding analytics)',
      'User workflows are intuitive (no training/docs required)',
      'Visual design meets Vercel/Linear/Stripe quality standards',
      'Error states and edge cases handled gracefully'
    ]
  },
  {
    lens: 'Academic',
    title_suffix: 'Academic Rigor Review',
    description: 'Verify statistical rigor and reproducibility: R²≥0.65 for model deliverables, p<0.05 for causal claims, methodology documented, results reproducible.',
    owner: 'Academic Rigor Critic',
    exit_criteria: [
      'Model performance: R²≥0.65 out-of-sample (if modeling milestone)',
      'Statistical significance: p<0.05 (if causal claims made)',
      'Methodology fully documented (reproducible by external researcher)',
      'Cross-validation results provided (no overfitting)'
    ]
  },
  {
    lens: 'Risk',
    title_suffix: 'Risk Review & Lessons Learned (PM Lens)',
    description: 'Document lessons learned, update risk register, identify what went well and what needs improvement. Capture blockers encountered and mitigation effectiveness.',
    owner: 'Project Manager (autopilot PM role)',
    exit_criteria: [
      'Lessons learned documented in state/context.md',
      'Risk register updated (state/risk_register.yaml if exists)',
      'Blockers and resolutions captured for future reference',
      'Retrospective insights recorded (what worked, what didn\'t)'
    ]
  },
  {
    lens: 'GoNoGo',
    title_suffix: 'Go/No-Go Decision',
    description: 'Final decision: Proceed to next milestone or iterate? All 7 expert lenses must pass. If ANY lens fails, return to implementation phase with clear action items.',
    owner: 'Director Dana + Orchestrator',
    exit_criteria: [
      'Technical Review: PASS ✅',
      'Quality Review: PASS ✅',
      'Business Review: PASS ✅',
      'UX Review: PASS ✅',
      'Academic Review: PASS ✅',
      'Risk Review: PASS ✅',
      'Decision documented in milestone notes'
    ]
  }
];

export class MilestoneReviewGenerator {
  private roadmapPath: string;

  constructor(rootDir: string = process.env.ROOT || process.cwd()) {
    this.roadmapPath = join(rootDir, 'state', 'roadmap.yaml');
  }

  /**
   * Main entry point: Check all milestones and generate reviews if needed
   */
  async checkAndGenerateReviews(): Promise<{ generated: number; milestones: string[] }> {
    if (!existsSync(this.roadmapPath)) {
      logWarning('Roadmap not found, skipping milestone review generation');
      return { generated: 0, milestones: [] };
    }

    const roadmap = this.loadRoadmap();
    const milestonesReviewGenerated: string[] = [];
    let totalGenerated = 0;

    for (const epic of roadmap.epics) {
      for (const milestone of epic.milestones) {
        const completion = this.calculateMilestoneCompletion(milestone);

        // Trigger: ≥80% complete AND no review tasks exist yet
        if (completion >= 0.80 && !this.hasReviewTasks(milestone)) {
          logInfo(`Milestone ${milestone.id} is ${(completion * 100).toFixed(0)}% complete - generating review tasks`);

          const reviewTasks = this.generateReviewTasks(milestone.id, milestone.title);
          milestone.tasks.push(...reviewTasks);
          totalGenerated += reviewTasks.length;
          milestonesReviewGenerated.push(milestone.id);

          logInfo(`Generated ${reviewTasks.length} review tasks for milestone ${milestone.id}`);
        }
      }
    }

    if (totalGenerated > 0) {
      this.saveRoadmap(roadmap);
      logInfo(`Total review tasks generated: ${totalGenerated} across ${milestonesReviewGenerated.length} milestones`);
    }

    return { generated: totalGenerated, milestones: milestonesReviewGenerated };
  }

  /**
   * Calculate milestone completion percentage (done tasks / total tasks)
   */
  private calculateMilestoneCompletion(milestone: Milestone): number {
    const tasks = milestone.tasks.filter(t => !t.id.includes('-Review-')); // Exclude review tasks from completion calculation
    if (tasks.length === 0) return 0;

    const doneTasks = tasks.filter(t => t.status === 'done').length;
    return doneTasks / tasks.length;
  }

  /**
   * Check if milestone already has review tasks (avoid duplicates)
   */
  private hasReviewTasks(milestone: Milestone): boolean {
    return milestone.tasks.some(t => t.id.includes('-Review-'));
  }

  /**
   * Generate 7 review tasks for a milestone
   */
  private generateReviewTasks(milestoneId: string, milestoneTitle: string): Task[] {
    return REVIEW_TASK_TEMPLATES.map(template => ({
      id: `${milestoneId}-Review-${template.lens}`,
      title: `[${milestoneTitle}] ${template.title_suffix}`,
      status: 'pending' as const,
      description: `${template.description}\n\n**Milestone**: ${milestoneTitle}\n**Owner**: ${template.owner}\n\n**Context**: This review ensures ${milestoneTitle} meets world-class standards before proceeding to next phase.`,
      dependencies: [], // Review tasks have no dependencies (all reviews can run in parallel after milestone 80% done)
      exit_criteria: template.exit_criteria,
      domain: 'product',
      owner: template.owner
    }));
  }

  /**
   * Load roadmap from YAML
   */
  private loadRoadmap(): Roadmap {
    const content = readFileSync(this.roadmapPath, 'utf-8');
    return yaml.load(content) as Roadmap;
  }

  /**
   * Save roadmap to YAML
   */
  private saveRoadmap(roadmap: Roadmap): void {
    const content = yaml.dump(roadmap, { lineWidth: -1, noRefs: true });
    writeFileSync(this.roadmapPath, content, 'utf-8');
    logInfo('Roadmap updated with review tasks');
  }

  /**
   * Get milestone status summary (for telemetry/reporting)
   */
  getMilestoneSummary(): { id: string; title: string; completion: number; hasReviews: boolean }[] {
    if (!existsSync(this.roadmapPath)) return [];

    const roadmap = this.loadRoadmap();
    const summary: { id: string; title: string; completion: number; hasReviews: boolean }[] = [];

    for (const epic of roadmap.epics) {
      for (const milestone of epic.milestones) {
        summary.push({
          id: milestone.id,
          title: milestone.title,
          completion: this.calculateMilestoneCompletion(milestone),
          hasReviews: this.hasReviewTasks(milestone)
        });
      }
    }

    return summary;
  }
}

/**
 * Standalone execution for testing/manual trigger
 */
if (require.main === module) {
  (async () => {
    const generator = new MilestoneReviewGenerator();
    const result = await generator.checkAndGenerateReviews();
    console.log(JSON.stringify(result, null, 2));

    const summary = generator.getMilestoneSummary();
    console.log('\nMilestone Summary:');
    summary.forEach(m => {
      console.log(`  ${m.id}: ${(m.completion * 100).toFixed(0)}% complete, reviews: ${m.hasReviews ? 'YES' : 'NO'}`);
    });
  })();
}
