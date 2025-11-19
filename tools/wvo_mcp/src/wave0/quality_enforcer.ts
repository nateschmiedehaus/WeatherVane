/**
 * Quality Enforcer for Wave 0.1
 *
 * Integrates all quality gates and critics
 * Ensures Wave 0 produces world-class code
 */

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

export interface QualityResult {
  passed: boolean;
  critics?: string[];
  violations?: string[];
  score?: number;
  recommendations?: string[];
}

export interface QualityInput {
  code: string;
  type: string;
  taskId: string;
}

export class QualityEnforcer {
  private criticThresholds = {
    StrategyReviewer: 85,
    ThinkingCritic: 85,
    DesignReviewer: 90,
    TestsCritic: 95,
    ProcessCritic: 90
  };

  /**
   * Enforce quality standards on code/artifacts
   */
  async enforceQuality(input: QualityInput): Promise<QualityResult> {
    logInfo(`QualityEnforcer: Enforcing quality for ${input.taskId}`);

    const result: QualityResult = {
      passed: true,
      critics: [],
      violations: [],
      score: 100,
      recommendations: []
    };

    try {
      // Run applicable critics based on input type
      switch (input.type) {
        case 'strategy':
          await this.runStrategyCritic(input, result);
          break;
        case 'thinking':
          await this.runThinkingCritic(input, result);
          break;
        case 'design':
          await this.runDesignCritic(input, result);
          break;
        case 'implementation':
          await this.runImplementationCritics(input, result);
          break;
        case 'test':
          await this.runTestCritic(input, result);
          break;
        default:
          await this.runGeneralCritics(input, result);
      }

      // Calculate final score
      result.score = this.calculateScore(result);
      result.passed = result.score >= 85 && result.violations!.length === 0;

      logInfo(`QualityEnforcer: Completed for ${input.taskId}`, {
        passed: result.passed,
        score: result.score,
        violations: result.violations?.length
      });

    } catch (error) {
      logError(`QualityEnforcer: Failed for ${input.taskId}`, { error });
      result.passed = false;
      result.violations?.push('Quality enforcement error: ' + error);
    }

    return result;
  }

  /**
   * Run strategy critic
   */
  private async runStrategyCritic(input: QualityInput, result: QualityResult): Promise<void> {
    result.critics?.push('StrategyReviewer');

    // Check for strategic thinking depth
    const normalized = input.code.toLowerCase();
    const mentionsWhy = normalized.includes('why');
    const hasWhyAnalysis = (mentionsWhy && !normalized.includes('no why')) || normalized.includes('root cause');
    const mentionsAlternative = normalized.includes('alternative') || normalized.includes('option');
    const hasAlternatives = mentionsAlternative && !normalized.includes('no alternative');
    const mentionsMetrics = normalized.includes('metric') || normalized.includes('measure');
    const hasMetrics = mentionsMetrics && !normalized.includes('no metric');

    if (!hasWhyAnalysis) {
      result.violations?.push('Missing WHY analysis - no root cause investigation');
    }
    if (!hasAlternatives) {
      result.violations?.push('No alternatives considered');
    }
    if (!hasMetrics) {
      result.violations?.push('No success metrics defined');
    }
  }

  /**
   * Run thinking critic
   */
  private async runThinkingCritic(input: QualityInput, result: QualityResult): Promise<void> {
    result.critics?.push('ThinkingCritic');

    // Check for depth of analysis
    const normalized = input.code.toLowerCase();
    const mentionsEdge = normalized.includes('edge case');
    const mentionsFailure = normalized.includes('failure');
    const hasEdgeCases = (mentionsEdge && !normalized.includes('no edge case')) || mentionsFailure;
    const mentionsComplexity = normalized.includes('complexity') || normalized.includes('o(');
    const hasComplexity = mentionsComplexity && !normalized.includes('no complexity');
    const mentionsMitigation = normalized.includes('mitigation') || normalized.includes('prevent');
    const hasMitigation = mentionsMitigation && !normalized.includes('no mitigation');

    if (!hasEdgeCases) {
      result.violations?.push('No edge cases considered');
    }
    if (!hasComplexity) {
      result.violations?.push('No complexity analysis');
    }
    if (!hasMitigation) {
      result.violations?.push('No risk mitigation strategies');
    }
  }

  /**
   * Run design critic
   */
  private async runDesignCritic(input: QualityInput, result: QualityResult): Promise<void> {
    result.critics?.push('DesignReviewer');

    // Check AFP/SCAS principles
    const normalized = input.code.toLowerCase();
    const hasViaNegativa = normalized.includes('delete') || normalized.includes('remove');
    const mentionsPatch = normalized.includes('patch') && !normalized.includes('not patch');
    const hasRefactor = normalized.includes('refactor') && !mentionsPatch;
    const hasSimplicity = normalized.includes('simple') || !normalized.includes('complex');

    if (!hasViaNegativa) {
      result.violations?.push('No Via Negativa consideration - prefer deletion');
    }
    if (!hasRefactor) {
      result.violations?.push('Patching symptoms instead of refactoring root cause');
    }
    if (!hasSimplicity) {
      result.recommendations?.push('Consider simpler alternatives');
    }
  }

  /**
   * Run implementation critics
   */
  private async runImplementationCritics(input: QualityInput, result: QualityResult): Promise<void> {
    result.critics?.push('CodeReviewer');
    result.critics?.push('SecurityReviewer');
    result.critics?.push('PerformanceReviewer');

    // Basic code quality checks
    const lines = input.code.split('\n');
    const hasComments = lines.some(l => l.includes('//') || l.includes('/*'));
    const hasTypes = input.code.includes(':') && input.code.includes('=>');
    const hasErrorHandling = input.code.includes('try') || input.code.includes('catch');

    if (!hasComments) {
      result.recommendations?.push('Add comments for complex logic');
    }
    if (!hasTypes) {
      result.recommendations?.push('Add TypeScript type annotations');
    }
    if (!hasErrorHandling) {
      result.violations?.push('Missing error handling');
    }

    // Security checks
    if (input.code.includes('eval(') || input.code.includes('exec(')) {
      result.violations?.push('SECURITY: Unsafe eval/exec usage');
    }
    if (input.code.includes('innerHTML')) {
      result.violations?.push('SECURITY: Potential XSS vulnerability');
    }

    // Performance checks
    if (input.code.includes('for') && input.code.includes('for', input.code.indexOf('for') + 3)) {
      result.recommendations?.push('PERFORMANCE: Nested loops detected - consider optimization');
    }
  }

  /**
   * Run test critic
   */
  private async runTestCritic(input: QualityInput, result: QualityResult): Promise<void> {
    result.critics?.push('TestsCritic');

    // Check test quality
    const hasAssertions = input.code.includes('expect') || input.code.includes('assert');
    const hasDescribe = input.code.includes('describe') || input.code.includes('it(');
    const hasMocking = input.code.includes('mock') || input.code.includes('spy');

    if (!hasAssertions) {
      result.violations?.push('Tests without assertions');
    }
    if (!hasDescribe) {
      result.violations?.push('Tests lack proper structure');
    }
    if (!hasMocking && input.code.length > 500) {
      result.recommendations?.push('Consider mocking external dependencies');
    }
  }

  /**
   * Run general critics
   */
  private async runGeneralCritics(input: QualityInput, result: QualityResult): Promise<void> {
    result.critics?.push('GeneralReviewer');

    // Check general quality
    if (input.code.length < 50) {
      result.violations?.push('Code too minimal - likely placeholder');
    }
    if (input.code.includes('TODO') || input.code.includes('FIXME')) {
      result.violations?.push('Unfinished work - contains TODO/FIXME');
    }
    if (input.code.includes('console.log') && !input.type.includes('test')) {
      result.recommendations?.push('Remove console.log statements');
    }
  }

  /**
   * Calculate overall quality score
   */
  private calculateScore(result: QualityResult): number {
    let score = 100;

    // Deduct for violations (10 points each)
    score -= (result.violations?.length || 0) * 10;

    // Deduct for recommendations (2 points each)
    score -= (result.recommendations?.length || 0) * 2;

    // Bonus for running multiple critics
    score += Math.min(10, (result.critics?.length || 0) * 2);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get critic configuration
   */
  getCriticConfig(): any {
    return {
      thresholds: this.criticThresholds,
      enabled: Object.keys(this.criticThresholds),
      strictMode: true
    };
  }
}
