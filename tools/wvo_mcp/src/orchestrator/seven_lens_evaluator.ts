/**
 * Twelve-Lens Task Evaluator (Evolved from Seven-Lens)
 *
 * Evaluates tasks through 12 expert perspectives to determine if a task is "ready to execute".
 *
 * **Original 7 Lenses**:
 * 1. CEO - Business strategy and revenue impact
 * 2. Designer - Visual excellence and brand
 * 3. UX - User experience and frictionless design
 * 4. CMO - Go-to-market and positioning
 * 5. Ad Expert - Platform integration feasibility
 * 6. Academic - Statistical rigor and research validity
 * 7. PM - Project management and execution clarity
 *
 * **Expanded 5 Lenses** (identified by Lens Gap Detector):
 * 8. CFO - Unit economics and financial health
 * 9. CTO - Technical scalability and architecture
 * 10. Customer Success - Retention and customer health
 * 11. DevOps/SRE - Operational reliability and deployment safety
 * 12. Legal/Compliance - Risk management and regulatory compliance
 *
 * **Purpose**: Ensure orchestrator makes decisions with world-class multi-disciplinary understanding
 * **Decision Rule**: Task is "ready to execute" ONLY if it passes ALL 12 lenses
 *
 * See: docs/ARCHITECTURE.md - 12-Lens Decision Framework
 * See: docs/MISSING_OBJECTIVES_ANALYSIS.md - Rationale for lens expansion
 */

import { logDebug, logInfo, logWarning } from '../telemetry/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface KeywordConfig {
  version: string;
  updated: string;
  description: string;
  lenses: Record<string, Record<string, string[]>>;
}

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

interface TwelveLensReport {
  taskId: string;
  overallPass: boolean; // True only if ALL 12 lenses pass
  lenses: LensEvaluation[];
  readyToExecute: boolean;
  blockers: string[]; // Lenses that failed
  recommendation: string;
}

// Alias for backwards compatibility
export type SevenLensReport = TwelveLensReport;

export class SevenLensEvaluator {
  private keywords: KeywordConfig;

  constructor() {
    this.keywords = this.loadKeywordConfig();
  }

  /**
   * Load keyword configuration from config file
   */
  private loadKeywordConfig(): KeywordConfig {
    const configPath = path.join(__dirname, '..', '..', 'config', 'lens_keywords.json');
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      logDebug('Loaded lens keyword configuration', { version: config.version });
      return config;
    } catch (error) {
      logWarning('Failed to load keyword config, using hardcoded fallback', { error });
      return this.getDefaultKeywords();
    }
  }

  /**
   * Fallback keywords if config file unavailable
   */
  private getDefaultKeywords(): KeywordConfig {
    return {
      version: '1.0.0-fallback',
      updated: new Date().toISOString(),
      description: 'Hardcoded fallback keywords',
      lenses: {
        ceo: {
          pocValidation: ['poc', 'proof of concept', 'validate model'],
          negativeCase: ['negative', 'random', 'control'],
          e2e: ['end-to-end', 'e2e'],
          revenue: ['demo', 'customer', 'revenue'],
          blocking: ['blocker', 'blocks'],
          infrastructure: ['infrastructure', 'scalability'],
          lowImpact: ['documentation', 'refactor']
        }
        // ... abbreviated fallback for other lenses
      }
    };
  }

  /**
   * Helper: Check if text matches any keywords in a lens group
   */
  private matchesKeywords(text: string, lens: string, group: string): boolean {
    const keywords = this.keywords.lenses[lens]?.[group] || [];
    return keywords.some(kw => text.includes(kw));
  }

  /**
   * Evaluate a task through all 12 expert lenses (evolved from 7)
   */
  evaluateTask(task: Task, context?: { roadmap?: any; recentCommits?: string[] }): TwelveLensReport {
    const lenses: LensEvaluation[] = [
      // Original 7 lenses
      this.evaluateCEOLens(task, context),
      this.evaluateDesignerLens(task, context),
      this.evaluateUXLens(task, context),
      this.evaluateCMOLens(task, context),
      this.evaluateAdExpertLens(task, context),
      this.evaluateAcademicLens(task, context),
      this.evaluatePMLens(task, context),
      // Expanded 5 lenses (2025-10-23)
      this.evaluateCFOLens(task, context),
      this.evaluateCTOLens(task, context),
      this.evaluateCustomerSuccessLens(task, context),
      this.evaluateDevOpsLens(task, context),
      this.evaluateLegalLens(task, context)
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
   *
   * PRIORITY #1 (2025-10-23): PoC Validation
   * - Proving model works (positive cases) → HIGHEST PRIORITY
   * - Proving model correctly identifies when it won't work (negative cases) → HIGHEST PRIORITY
   * - End-to-end simulation (forecast → recommendations → automation) → HIGH PRIORITY
   * - Infrastructure work that doesn't unblock PoC → DEPRIORITIZE
   */
  private evaluateCEOLens(task: Task, context?: any): LensEvaluation {
    let score = 50; // Neutral baseline
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // HIGHEST PRIORITY: PoC Validation (Critical Path to Revenue)
    // Keywords now loaded from config/lens_keywords.json
    const isPoCValidation = this.matchesKeywords(text, 'ceo', 'pocValidation');

    if (isPoCValidation) {
      score += 40; // MASSIVE boost - PoC is THE priority

      // Extra boost for negative case testing (good science!)
      const isNegativeCase = this.matchesKeywords(text, 'ceo', 'negativeCase');
      if (isNegativeCase) {
        score += 10; // Extra credit for good science
      }

      // Extra boost for end-to-end simulation
      const isE2E = this.matchesKeywords(text, 'ceo', 'e2e');
      if (isE2E) {
        score += 10; // This is what we show prospects!
      }
    } else {
      concerns.push('Task does not directly contribute to PoC validation (THE priority)');
    }

    // Check if task is on critical path to revenue
    const isRevenueCritical = this.matchesKeywords(text, 'ceo', 'revenue');

    if (isRevenueCritical && !isPoCValidation) {
      score += 20; // Good, but not as critical as PoC validation
    }

    if (!isPoCValidation && !isRevenueCritical) {
      concerns.push('Task does not clearly articulate revenue impact');
    }

    // Check if blocks other high-priority work
    const isBlocking = this.matchesKeywords(text, 'ceo', 'blocking');

    if (isBlocking) {
      score += 15;
    }

    // PENALIZE infrastructure work that doesn't unblock PoC
    const isInfrastructure = this.matchesKeywords(text, 'ceo', 'infrastructure');

    if (isInfrastructure && !isPoCValidation) {
      score -= 30; // HEAVY penalty - wrong priority!
      concerns.push('Infrastructure work before PoC proven - wrong priority (see POC_OBJECTIVES_PRIORITY.md)');
    }

    // Penalize low-impact work (documentation, refactoring without clear business case)
    const isLowImpact = this.matchesKeywords(task.title.toLowerCase(), 'ceo', 'lowImpact') && !isPoCValidation;

    if (isLowImpact) {
      score -= 20;
      concerns.push('Low immediate business impact (documentation/cleanup) - PoC validation is the priority');
    }

    const passed = score >= 70;
    return {
      lens: 'CEO',
      passed,
      score,
      reasoning: isPoCValidation
        ? `✅ PoC VALIDATION - HIGHEST PRIORITY (proving model works + negative case testing)`
        : `Revenue criticality: ${isRevenueCritical ? 'MEDIUM' : 'LOW'}. PoC validation should be priority.`,
      concerns
    };
  }

  /**
   * Designer Lens: World-class visual/brand standards?
   */
  private evaluateDesignerLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-UI work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is UI/visual work
    const isUIWork = this.matchesKeywords(text, 'designer', 'ui');

    if (isUIWork) {
      // UI work must meet high standards
      score = 40; // Start lower for UI work

      const mentionsDesignSystem = this.matchesKeywords(text, 'designer', 'designSystem');

      if (mentionsDesignSystem) {
        score += 30;
      } else {
        concerns.push('UI work does not reference design system standards');
      }

      const mentionsQuality = this.matchesKeywords(text, 'designer', 'quality');

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
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this affects user experience
    const affectsUX = this.matchesKeywords(text, 'ux', 'ux');

    if (affectsUX) {
      score = 40; // Start lower for UX-affecting work

      const mentionsFrictionless = this.matchesKeywords(text, 'ux', 'frictionless');

      if (mentionsFrictionless) {
        score += 30;
      } else {
        concerns.push('UX work does not specify time-to-value or friction metrics');
      }

      const mentionsAutomation = this.matchesKeywords(text, 'ux', 'automation');

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
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is GTM-related work
    const isGTMWork = this.matchesKeywords(text, 'cmo', 'gtm');

    if (isGTMWork) {
      score = 50;

      const mentionsNarrative = this.matchesKeywords(text, 'cmo', 'narrative');

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
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this involves ad platform integration
    const isAdPlatformWork = this.matchesKeywords(text, 'adExpert', 'platform');

    if (isAdPlatformWork) {
      score = 50;

      const mentionsConstraints = this.matchesKeywords(text, 'adExpert', 'constraints');

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
   *
   * UPDATED (2025-10-23): Negative results are GOOD SCIENCE!
   * - Testing that model fails on random data → HIGH SCORE
   * - Only testing positive cases without negative controls → PENALTY
   */
  private evaluateAcademicLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-research work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is modeling/research work
    const isResearchWork = this.matchesKeywords(text, 'academic', 'research');

    if (isResearchWork) {
      score = 40;

      // BOOST for negative case testing (this is GOOD science!)
      const hasNegativeCase = this.matchesKeywords(text, 'academic', 'negativeCase');

      if (hasNegativeCase) {
        score += 35; // MAJOR boost - this proves we're not snake oil!
      }

      // Check for statistical rigor
      const mentionsRigor = this.matchesKeywords(text, 'academic', 'rigor');

      if (mentionsRigor) {
        score += 30;
      } else {
        concerns.push('Research work does not specify statistical validation criteria (R²≥0.65, p<0.05)');
      }

      // Check for diverse test cases
      const diversityKeywords = ['diverse', 'multiple tenants', 'varied', 'range of', '20 tenants', 'different'];
      const mentionsDiversity = diversityKeywords.some(kw => text.includes(kw));

      if (mentionsDiversity) {
        score += 10; // Good - testing on diverse data
      }

      // Check for methodology documentation
      const methodologyKeywords = ['methodology', 'documented', 'reproducible', 'procedure'];
      const mentionsMethodology = methodologyKeywords.some(kw => text.includes(kw));

      if (mentionsMethodology) {
        score += 15;
      } else {
        concerns.push('No reproducibility/methodology documentation mentioned');
      }

      // PENALTY for only positive case testing (bad science!)
      const onlyPositiveKeywords = ['only', 'just', 'perfect', 'ideal'];
      const seemsOnlyPositive = onlyPositiveKeywords.some(kw => text.includes(kw)) && !hasNegativeCase;

      if (seemsOnlyPositive && isResearchWork) {
        score -= 15;
        concerns.push('⚠️ Only testing positive cases without negative controls is bad science - need to prove model can identify when it WON\'T work');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'Academic',
      passed,
      score,
      reasoning: isResearchWork
        ? `Research work requires statistical rigor (R²≥0.65, p<0.05) AND negative case testing to prove model isn't snake oil`
        : 'Non-research work, auto-pass',
      concerns
    };
  }

  /**
   * PM Lens: Critical path impact? Dependencies clear?
   */
  private evaluatePMLens(task: Task, context?: any): LensEvaluation {
    let score = 50; // Neutral baseline
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

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

    // Check if task is on critical path
    const isCriticalPath = this.matchesKeywords(text, 'pm', 'dependencies');

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
   * CFO Lens: Unit economics healthy? Positive margins?
   */
  private evaluateCFOLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-financial work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is financial/pricing work
    const isFinancialWork = this.matchesKeywords(text, 'cfo', 'economics') ||
                           this.matchesKeywords(text, 'cfo', 'pricing') ||
                           this.matchesKeywords(text, 'cfo', 'metrics');

    if (isFinancialWork) {
      score = 40; // Start lower for financial work

      const rigorKeywords = ['calculate', 'analysis', 'margin', 'target', 'threshold'];
      const mentionsRigor = rigorKeywords.some(kw => text.includes(kw));

      if (mentionsRigor) {
        score += 30;
      } else {
        concerns.push('Financial work does not specify calculation methodology or success thresholds');
      }

      // Check for specific metrics
      const metricsKeywords = ['70%', 'cac', 'ltv', '3:1'];
      const mentionsMetrics = metricsKeywords.some(kw => text.includes(kw));

      if (mentionsMetrics) {
        score += 20;
      } else {
        concerns.push('No specific financial metrics or targets mentioned (e.g., gross margin ≥70%, LTV/CAC ≥3:1)');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'CFO',
      passed,
      score,
      reasoning: isFinancialWork ? 'Financial work requires unit economics analysis and clear metrics' : 'Non-financial work, auto-pass',
      concerns
    };
  }

  /**
   * CTO Lens: Scalable to 100/1000 tenants? Technical architecture sound?
   */
  private evaluateCTOLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-scalability work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is scalability/architecture work
    const isScalabilityWork = this.matchesKeywords(text, 'cto', 'scalability') ||
                              this.matchesKeywords(text, 'cto', 'architecture') ||
                              this.matchesKeywords(text, 'cto', 'security');

    if (isScalabilityWork) {
      score = 40; // Start lower for scalability work

      const planKeywords = ['10x', '100x', '1000', 'load test', 'benchmark', 'capacity'];
      const mentionsPlan = planKeywords.some(kw => text.includes(kw));

      if (mentionsPlan) {
        score += 30;
      } else {
        concerns.push('Scalability work does not specify target scale (10x? 100x?) or performance benchmarks');
      }

      const constraintsKeywords = ['limit', 'bottleneck', 'connection', 'pooling'];
      const mentionsConstraints = constraintsKeywords.some(kw => text.includes(kw));

      if (mentionsConstraints) {
        score += 20;
      } else {
        concerns.push('No technical constraints or bottlenecks identified');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'CTO',
      passed,
      score,
      reasoning: isScalabilityWork ? 'Scalability work requires capacity planning and performance benchmarks' : 'Non-scalability work, auto-pass',
      concerns
    };
  }

  /**
   * Customer Success Lens: Reduces churn? Improves retention?
   */
  private evaluateCustomerSuccessLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-CS work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this affects customer retention/success
    const isCSWork = this.matchesKeywords(text, 'customerSuccess', 'retention') ||
                     this.matchesKeywords(text, 'customerSuccess', 'support') ||
                     this.matchesKeywords(text, 'customerSuccess', 'satisfaction');

    if (isCSWork) {
      score = 50; // Start lower for CS work

      const metricsKeywords = ['metric', 'measure', 'track', 'rate', 'nps', 'score'];
      const mentionsMetrics = metricsKeywords.some(kw => text.includes(kw));

      if (mentionsMetrics) {
        score += 25;
      } else {
        concerns.push('Customer success work does not specify metrics to track (churn rate, NPS, health score)');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'Customer Success',
      passed,
      score,
      reasoning: isCSWork ? 'CS work requires retention metrics and customer health tracking' : 'Non-CS work, auto-pass',
      concerns
    };
  }

  /**
   * DevOps/SRE Lens: Reliable? Monitored? Safe deployment?
   */
  private evaluateDevOpsLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-ops work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is ops/reliability work
    const isOpsWork = this.matchesKeywords(text, 'devops', 'reliability') ||
                      this.matchesKeywords(text, 'devops', 'deployment') ||
                      this.matchesKeywords(text, 'devops', 'infrastructure');

    if (isOpsWork) {
      score = 40; // Start lower for ops work

      const monitoringKeywords = ['monitor', 'alert', 'pagerduty', 'datadog', 'grafana'];
      const mentionsMonitoring = monitoringKeywords.some(kw => text.includes(kw));

      if (mentionsMonitoring) {
        score += 30;
      } else {
        concerns.push('Ops work does not specify monitoring/alerting strategy');
      }

      const slaKeywords = ['sla', '99', 'uptime', 'target', 'mttr', 'mttd'];
      const mentionsSLA = slaKeywords.some(kw => text.includes(kw));

      if (mentionsSLA) {
        score += 20;
      } else {
        concerns.push('No SLA targets or reliability metrics specified (e.g., 99.5% uptime, MTTR <1 hour)');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'DevOps/SRE',
      passed,
      score,
      reasoning: isOpsWork ? 'Ops work requires monitoring, alerting, and SLA targets' : 'Non-ops work, auto-pass',
      concerns
    };
  }

  /**
   * Legal/Compliance Lens: GDPR/CCPA compliant? SOC2 ready?
   */
  private evaluateLegalLens(task: Task, context?: any): LensEvaluation {
    let score = 70; // Default pass for non-legal work
    const concerns: string[] = [];
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    // Check if this is legal/compliance work
    const isLegalWork = this.matchesKeywords(text, 'legal', 'compliance') ||
                        this.matchesKeywords(text, 'legal', 'risk') ||
                        this.matchesKeywords(text, 'legal', 'data');

    if (isLegalWork) {
      score = 40; // Start lower for legal work

      const requirementsKeywords = ['requirement', 'must', 'shall', 'comply', 'regulation'];
      const mentionsRequirements = requirementsKeywords.some(kw => text.includes(kw));

      if (mentionsRequirements) {
        score += 30;
      } else {
        concerns.push('Legal work does not specify regulatory requirements or compliance standards');
      }

      const documentationKeywords = ['document', 'policy', 'agreement', 'record'];
      const mentionsDocumentation = documentationKeywords.some(kw => text.includes(kw));

      if (mentionsDocumentation) {
        score += 20;
      } else {
        concerns.push('No documentation or policy artifacts mentioned');
      }
    }

    const passed = score >= 70;
    return {
      lens: 'Legal/Compliance',
      passed,
      score,
      reasoning: isLegalWork ? 'Legal work requires clear regulatory requirements and documentation' : 'Non-legal work, auto-pass',
      concerns
    };
  }

  /**
   * Generate recommendation based on lens evaluations
   */
  private generateRecommendation(allPassed: boolean, lenses: LensEvaluation[]): string {
    if (allPassed) {
      return '✅ READY TO EXECUTE - All 12 expert lenses pass. Orchestrator should begin execution immediately.';
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
  evaluateBatch(tasks: Task[], context?: any): TwelveLensReport[] {
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
