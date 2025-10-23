/**
 * Seven-Lens Task Evaluator
 *
 * Evaluates tasks through 7 expert perspectives (CEO, Designer, UX, CMO, Ad Expert, Academic, PM)
 * to determine if a task is "ready to execute" (passes all 7 lenses).
 *
 * **Purpose**: Ensure orchestrator makes decisions with world-class multi-disciplinary understanding
 * **Decision Rule**: Task is "ready to execute" ONLY if it passes ALL 7 lenses
 *
 * See: docs/ARCHITECTURE.md - 7-Lens Decision Framework
 */

import { logDebug, logInfo } from '../telemetry/logger.js';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  dependencies?: string[];
  exit_criteria?: string[];
  estimated_hours?: number;
  domain?: string;
}

interface LensEvaluation {
  lens: string;
  passed: boolean;
  score: number; // 0-100
  reasoning: string;
  concerns: string[];
}

interface SevenLensReport {
  taskId: string;
  overallPass: boolean; // True only if ALL 7 lenses pass
  lenses: LensEvaluation[];
  readyToExecute: boolean;
  blockers: string[]; // Lenses that failed
  recommendation: string;
}

export class SevenLensEvaluator {
  /**
   * Evaluate a task through all 7 expert lenses
   */
  evaluateTask(task: Task, context?: { roadmap?: any; recentCommits?: string[] }): SevenLensReport {
    const lenses: LensEvaluation[] = [
      this.evaluateCEOLens(task, context),
      this.evaluateDesignerLens(task, context),
      this.evaluateUXLens(task, context),
      this.evaluateCMOLens(task, context),
      this.evaluateAdExpertLens(task, context),
      this.evaluateAcademicLens(task, context),
      this.evaluatePMLens(task, context)
    ];

    const allPassed = lenses.every(l => l.passed);
    const blockers = lenses.filter(l => !l.passed).map(l => l.lens);

    const recommendation = this.generateRecommendation(allPassed, lenses);

    return {
      taskId: task.id,
      overallPass: allPassed,
      lenses,
      readyToExecute: allPassed,
      blockers,
      recommendation
    };
  }

  /**
   * CEO Lens: Does this unblock revenue? Highest ROI use of time?
   */
  private evaluateCEOLens(task: Task, context?: any): LensEvaluation {
    let score = 50; // Neutral baseline
    const concerns: string[] = [];

    // Check if task is on critical path to revenue
    const revenueKeywords = ['demo', 'customer', 'pilot', 'revenue', 'prospect', 'sales', 'payment', 'mrr', 'synthetic data', 'model validation'];
    const isRevenueCritical = revenueKeywords.some(kw =>
      task.title.toLowerCase().includes(kw) ||
      (task.description?.toLowerCase().includes(kw) ?? false)
    );

    if (isRevenueCritical) {
      score += 30;
    } else {
      concerns.push('Task does not clearly articulate revenue impact');
    }

    // Check if blocks other high-priority work
    const blockingKeywords = ['blocker', 'blocks', 'prerequisite', 'foundation', 'infrastructure'];
    const isBlocking = blockingKeywords.some(kw =>
      task.description?.toLowerCase().includes(kw) ?? false
    );

    if (isBlocking) {
      score += 15;
    }

    // Penalize low-impact work (documentation, refactoring without clear business case)
    const lowImpactKeywords = ['documentation', 'refactor', 'cleanup', 'style'];
    const isLowImpact = lowImpactKeywords.some(kw =>
      task.title.toLowerCase().includes(kw)
    ) && !isRevenueCritical;

    if (isLowImpact) {
      score -= 20;
      concerns.push('Low immediate business impact (documentation/cleanup)');
    }

    const passed = score >= 70;
    return {
      lens: 'CEO',
      passed,
      score,
      reasoning: `Revenue criticality: ${isRevenueCritical ? 'HIGH' : 'LOW'}. Blocking work: ${isBlocking ? 'YES' : 'NO'}.`,
      concerns
    };
  }

  /**
   * Designer Lens: World-class visual/brand standards?
   */
  private evaluateDesignerLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-UI work
    const concerns: string[] = [];

    // Check if this is UI/visual work
    const uiKeywords = ['ui', 'design', 'frontend', 'component', 'styling', 'visual', 'layout', 'dashboard'];
    const isUIWork = uiKeywords.some(kw =>
      task.title.toLowerCase().includes(kw) ||
      (task.description?.toLowerCase().includes(kw) ?? false)
    );

    if (isUIWork) {
      // UI work must meet high standards
      score = 40; // Start lower for UI work

      const designSystemKeywords = ['design system', 'figma', 'storybook', 'component library'];
      const mentionsDesignSystem = designSystemKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsDesignSystem) {
        score += 30;
      } else {
        concerns.push('UI work does not reference design system standards');
      }

      const qualityKeywords = ['vercel', 'linear', 'stripe', 'world-class', 'polished'];
      const mentionsQuality = qualityKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsQuality) {
        score += 20;
      } else {
        concerns.push('No explicit quality benchmark (Vercel/Linear/Stripe level)');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'Designer',
      passed,
      score,
      reasoning: isUIWork ? 'UI work requires design system alignment and quality benchmarks' : 'Non-UI work, auto-pass',
      concerns
    };
  }

  /**
   * UX Lens: Frictionless? <5min to value? No training required?
   */
  private evaluateUXLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-UX work
    const concerns: string[] = [];

    // Check if this affects user experience
    const uxKeywords = ['onboarding', 'workflow', 'user', 'dashboard', 'automation', 'experience'];
    const affectsUX = uxKeywords.some(kw =>
      task.title.toLowerCase().includes(kw) ||
      (task.description?.toLowerCase().includes(kw) ?? false)
    );

    if (affectsUX) {
      score = 40; // Start lower for UX-affecting work

      const frictionlessKeywords = ['<5 min', 'quick', 'easy', 'simple', 'intuitive', 'no training'];
      const mentionsFrictionless = frictionlessKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsFrictionless) {
        score += 30;
      } else {
        concerns.push('UX work does not specify time-to-value or friction metrics');
      }

      const automationKeywords = ['automate', 'default', 'one-click'];
      const mentionsAutomation = automationKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsAutomation) {
        score += 20;
      } else {
        concerns.push('No automation mentioned (bias toward automation)');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'UX',
      passed,
      score,
      reasoning: affectsUX ? 'UX-affecting work requires frictionless design and automation' : 'Non-UX work, auto-pass',
      concerns
    };
  }

  /**
   * CMO Lens: Supports GTM narrative? Positioning clear?
   */
  private evaluateCMOLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-GTM work
    const concerns: string[] = [];

    // Check if this is GTM-related work
    const gtmKeywords = ['demo', 'prospect', 'messaging', 'pitch', 'case study', 'customer'];
    const isGTMWork = gtmKeywords.some(kw =>
      task.title.toLowerCase().includes(kw) ||
      (task.description?.toLowerCase().includes(kw) ?? false)
    );

    if (isGTMWork) {
      score = 50;

      const narrativeKeywords = ['15-30%', 'weather', 'lift', 'roas', 'incremental revenue'];
      const mentionsNarrative = narrativeKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsNarrative) {
        score += 25;
      } else {
        concerns.push('GTM work does not reference core value proposition (15-30% revenue via weather)');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'CMO',
      passed,
      score,
      reasoning: isGTMWork ? 'GTM work must align with "capture 15-30% more revenue via weather timing" narrative' : 'Non-GTM work, auto-pass',
      concerns
    };
  }

  /**
   * Ad Expert Lens: Technically feasible within platform constraints?
   */
  private evaluateAdExpertLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-ad-platform work
    const concerns: string[] = [];

    // Check if this involves ad platform integration
    const adPlatformKeywords = ['meta', 'google ads', 'facebook', 'instagram', 'api', 'shopify', 'campaign'];
    const isAdPlatformWork = adPlatformKeywords.some(kw =>
      task.title.toLowerCase().includes(kw) ||
      (task.description?.toLowerCase().includes(kw) ?? false)
    );

    if (isAdPlatformWork) {
      score = 50;

      const constraintKeywords = ['rate limit', 'api limit', 'retry', 'error handling', 'oauth'];
      const mentionsConstraints = constraintKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsConstraints) {
        score += 25;
      } else {
        concerns.push('Ad platform work does not address API constraints/limits/error handling');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'Ad Expert',
      passed,
      score,
      reasoning: isAdPlatformWork ? 'Ad platform work must handle rate limits, errors, OAuth flows' : 'Non-ad-platform work, auto-pass',
      concerns
    };
  }

  /**
   * Academic Lens: Statistically valid? Reproducible?
   */
  private evaluateAcademicLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-research work
    const concerns: string[] = [];

    // Check if this is modeling/research work
    const researchKeywords = ['model', 'mmm', 'validation', 'experiment', 'causal', 'statistical'];
    const isResearchWork = researchKeywords.some(kw =>
      task.title.toLowerCase().includes(kw) ||
      (task.description?.toLowerCase().includes(kw) ?? false)
    );

    if (isResearchWork) {
      score = 40;

      const rigorKeywords = ['r²', 'p-value', 'cross-validation', 'out-of-sample', 'reproducible'];
      const mentionsRigor = rigorKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsRigor) {
        score += 30;
      } else {
        concerns.push('Research work does not specify statistical validation criteria (R²≥0.65, p<0.05)');
      }

      const methodologyKeywords = ['methodology', 'documented', 'reproducible'];
      const mentionsMethodology = methodologyKeywords.some(kw =>
        task.description?.toLowerCase().includes(kw) ?? false
      );

      if (mentionsMethodology) {
        score += 20;
      } else {
        concerns.push('No reproducibility/methodology documentation mentioned');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'Academic',
      passed,
      score,
      reasoning: isResearchWork ? 'Research work requires statistical rigor (R²≥0.65, p<0.05) and reproducibility' : 'Non-research work, auto-pass',
      concerns
    };
  }

  /**
   * PM Lens: Critical path impact? Dependencies clear?
   */
  private evaluatePMLens(task: Task, context?: any): LensEvaluation {
    let score = 50; // Neutral baseline
    const concerns: string[] = [];

    // Check if dependencies are defined
    if (!task.dependencies || task.dependencies.length === 0) {
      // No dependencies = can start immediately (good)
      score += 20;
    } else {
      // Has dependencies - need to verify they're done
      concerns.push(`Task has ${task.dependencies.length} dependencies - verify they're complete`);
    }

    // Check if exit criteria are clear
    if (task.exit_criteria && task.exit_criteria.length > 0) {
      score += 20;
    } else {
      concerns.push('No exit criteria defined - how do we know when task is done?');
    }

    // Check estimated hours (too large = needs decomposition)
    if (task.estimated_hours && task.estimated_hours > 16) {
      score -= 15;
      concerns.push(`Task estimated >16 hours (${task.estimated_hours}h) - needs decomposition into smaller subtasks`);
    }

    // Check if task is on critical path (uses context if available)
    const criticalPathKeywords = ['blocker', 'blocks', 'critical', 'prerequisite'];
    const isCriticalPath = criticalPathKeywords.some(kw =>
      task.description?.toLowerCase().includes(kw) ?? false
    );

    if (isCriticalPath) {
      score += 15;
    }

    const passed = score >= 70;
    return {
      lens: 'PM',
      passed,
      score,
      reasoning: `Dependencies: ${task.dependencies?.length ?? 0}, Exit criteria: ${task.exit_criteria?.length ?? 0}, Critical path: ${isCriticalPath ? 'YES' : 'NO'}`,
      concerns
    };
  }

  /**
   * Generate recommendation based on lens evaluations
   */
  private generateRecommendation(allPassed: boolean, lenses: LensEvaluation[]): string {
    if (allPassed) {
      return '✅ READY TO EXECUTE - All 7 expert lenses pass. Orchestrator should begin execution immediately.';
    }

    const failedLenses = lenses.filter(l => !l.passed);
    const recommendations = failedLenses.map(l =>
      `  • ${l.lens}: ${l.concerns.join('; ')}`
    ).join('\n');

    return `❌ NOT READY - ${failedLenses.length} lens(es) failed. Address concerns before executing:\n${recommendations}`;
  }

  /**
   * Batch evaluate multiple tasks and rank by readiness
   */
  evaluateBatch(tasks: Task[], context?: any): SevenLensReport[] {
    const reports = tasks.map(task => this.evaluateTask(task, context));

    // Sort by: (1) All pass = top, (2) Most lenses passed, (3) Highest average score
    reports.sort((a, b) => {
      if (a.overallPass && !b.overallPass) return -1;
      if (!a.overallPass && b.overallPass) return 1;

      const aPassCount = a.lenses.filter(l => l.passed).length;
      const bPassCount = b.lenses.filter(l => l.passed).length;
      if (aPassCount !== bPassCount) return bPassCount - aPassCount;

      const aAvgScore = a.lenses.reduce((sum, l) => sum + l.score, 0) / a.lenses.length;
      const bAvgScore = b.lenses.reduce((sum, l) => sum + l.score, 0) / b.lenses.length;
      return bAvgScore - aAvgScore;
    });

    return reports;
  }
}

/**
 * Standalone execution for testing
 */
if (require.main === module) {
  const evaluator = new SevenLensEvaluator();

  // Example: Evaluate a task
  const exampleTask: Task = {
    id: 'T-MLR-1.2',
    title: 'Generate 3 years of synthetic data for 20 tenants',
    description: 'Generate synthetic data with known weather elasticity for model training and validation. Target: 219,000 rows, weather correlations ≥0.90.',
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

  const report = evaluator.evaluateTask(exampleTask);
  console.log(JSON.stringify(report, null, 2));
}
