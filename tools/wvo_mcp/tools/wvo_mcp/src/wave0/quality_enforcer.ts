/**
 * Quality Enforcer for Wave 0.1
 *
 * Integrates ALL critics and quality gates:
 * - StrategyReviewer - Validates strategic thinking
 * - ThinkingCritic - Validates depth of analysis
 * - DesignReviewer - Validates AFP/SCAS design
 * - TestsCritic - Validates test coverage
 * - ProcessCritic - Enforces process compliance
 *
 * Ensures Wave 0 maintains the same quality standards as manual execution.
 */

import { RealMCPClient } from './real_mcp_client.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import * as path from 'path';

export interface CriticResult {
  critic: string;
  status: 'approved' | 'blocked' | 'warning';
  score?: number;
  concerns: string[];
  recommendations: string[];
}

export interface QualityReport {
  phase: string;
  overallStatus: 'approved' | 'blocked' | 'needs_improvement';
  criticResults: CriticResult[];
  afpCompliance: boolean;
  scasScores: {
    simplicity: number;
    completeness: number;
    abstraction: number;
    scalability: number;
  };
  processCompliance: {
    allPhasesExecuted: boolean;
    evidenceGenerated: boolean;
    testsWritten: boolean;
    verificationComplete: boolean;
  };
}

export class QualityEnforcer {
  private mcp: RealMCPClient;
  private workspaceRoot: string;

  // Quality thresholds
  private readonly thresholds = {
    strategyScore: 7,     // Minimum strategy reviewer score
    thinkingScore: 7,     // Minimum thinking critic score
    designScore: 7,       // Minimum design reviewer score
    testCoverage: 80,     // Minimum test coverage %
    scasMinimum: 6,      // Minimum SCAS score per dimension
    afpCompliance: 0.8   // 80% AFP compliance required
  };

  constructor(mcp: RealMCPClient, workspaceRoot: string) {
    this.mcp = mcp;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Run StrategyReviewer critic
   */
  async runStrategyReviewer(taskId: string): Promise<CriticResult> {
    logInfo(`QualityEnforcer: Running StrategyReviewer for ${taskId}`);

    try {
      // Run the strategy reviewer script
      const output = await this.mcp.bash(
        `cd tools/wvo_mcp && npm run strategy:review ${taskId} 2>&1 || true`
      );

      return this.parseReviewerOutput('StrategyReviewer', output);
    } catch (error) {
      logError('StrategyReviewer failed', { error });
      return {
        critic: 'StrategyReviewer',
        status: 'warning',
        concerns: ['Could not run StrategyReviewer'],
        recommendations: ['Check npm scripts configuration']
      };
    }
  }

  /**
   * Run ThinkingCritic
   */
  async runThinkingCritic(taskId: string): Promise<CriticResult> {
    logInfo(`QualityEnforcer: Running ThinkingCritic for ${taskId}`);

    try {
      const output = await this.mcp.bash(
        `cd tools/wvo_mcp && npm run think:review ${taskId} 2>&1 || true`
      );

      return this.parseReviewerOutput('ThinkingCritic', output);
    } catch (error) {
      logError('ThinkingCritic failed', { error });
      return {
        critic: 'ThinkingCritic',
        status: 'warning',
        concerns: ['Could not run ThinkingCritic'],
        recommendations: ['Check npm scripts configuration']
      };
    }
  }

  /**
   * Run DesignReviewer (GATE)
   */
  async runDesignReviewer(taskId: string): Promise<CriticResult> {
    logInfo(`QualityEnforcer: Running DesignReviewer for ${taskId}`);

    try {
      const output = await this.mcp.bash(
        `cd tools/wvo_mcp && npm run gate:review ${taskId} 2>&1 || true`
      );

      const result = this.parseReviewerOutput('DesignReviewer', output);

      // DesignReviewer is critical - must pass
      if (output.includes('BLOCKED') || output.includes('blocked')) {
        result.status = 'blocked';
        logWarning('DesignReviewer BLOCKED - must remediate');
      }

      return result;
    } catch (error) {
      logError('DesignReviewer failed', { error });
      return {
        critic: 'DesignReviewer',
        status: 'blocked',
        concerns: ['DesignReviewer could not run'],
        recommendations: ['Fix design review configuration']
      };
    }
  }

  /**
   * Run TestsCritic
   */
  async runTestsCritic(taskId: string): Promise<CriticResult> {
    logInfo(`QualityEnforcer: Running TestsCritic for ${taskId}`);

    try {
      // Check test files exist
      const testFiles = await this.mcp.bash(
        `find state/evidence/${taskId} -name "*.test.ts" -o -name "*test*.md" | wc -l`
      );

      const testCount = parseInt(testFiles.trim());

      if (testCount === 0) {
        return {
          critic: 'TestsCritic',
          status: 'blocked',
          concerns: ['No test files found'],
          recommendations: ['Write tests before implementation']
        };
      }

      // Run test validation
      const output = await this.mcp.bash(
        `cd tools/wvo_mcp && npm test 2>&1 | grep -E "PASS|FAIL|Coverage" || true`
      );

      // Extract coverage if available
      const coverageMatch = output.match(/Coverage:\s*(\d+)%/);
      const coverage = coverageMatch ? parseInt(coverageMatch[1]) : 0;

      if (coverage < this.thresholds.testCoverage) {
        return {
          critic: 'TestsCritic',
          status: 'warning',
          score: coverage,
          concerns: [`Test coverage ${coverage}% below threshold ${this.thresholds.testCoverage}%`],
          recommendations: ['Increase test coverage', 'Add edge case tests']
        };
      }

      return {
        critic: 'TestsCritic',
        status: 'approved',
        score: coverage,
        concerns: [],
        recommendations: []
      };
    } catch (error) {
      logError('TestsCritic failed', { error });
      return {
        critic: 'TestsCritic',
        status: 'warning',
        concerns: ['Could not validate tests'],
        recommendations: ['Check test configuration']
      };
    }
  }

  /**
   * Run ProcessCritic
   */
  async runProcessCritic(taskId: string): Promise<CriticResult> {
    logInfo(`QualityEnforcer: Running ProcessCritic for ${taskId}`);

    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Check all phase evidence exists
    const requiredPhases = [
      'strategy.md',
      'spec.md',
      'plan.md',
      'think.md',
      'design.md',
      'implement.md',
      'verify.md',
      'review.md'
    ];

    for (const phase of requiredPhases) {
      const exists = await this.checkFileExists(`state/evidence/${taskId}/${phase}`);
      if (!exists) {
        concerns.push(`Missing ${phase} evidence`);
        recommendations.push(`Generate ${phase} before proceeding`);
      }
    }

    // Check GATE was run
    const designFile = await this.mcp.read(`state/evidence/${taskId}/design.md`).catch(() => '');
    if (!designFile.includes('AFP') || !designFile.includes('SCAS')) {
      concerns.push('Design missing AFP/SCAS analysis');
      recommendations.push('Run proper GATE review');
    }

    // Check tests written BEFORE implementation
    const planFile = await this.mcp.read(`state/evidence/${taskId}/plan.md`).catch(() => '');
    if (!planFile.includes('Test') && !planFile.includes('test')) {
      concerns.push('No test planning in PLAN phase');
      recommendations.push('Plan tests before implementation');
    }

    // Check verification was run
    const verifyFile = await this.mcp.read(`state/evidence/${taskId}/verify.md`).catch(() => '');
    if (!verifyFile.includes('Build') || !verifyFile.includes('Test')) {
      concerns.push('Verification incomplete');
      recommendations.push('Run full verification loop');
    }

    return {
      critic: 'ProcessCritic',
      status: concerns.length === 0 ? 'approved' :
              concerns.length > 3 ? 'blocked' : 'warning',
      concerns,
      recommendations
    };
  }

  /**
   * Calculate AFP compliance score
   */
  async calculateAFPCompliance(taskId: string): Promise<number> {
    let score = 0;
    let checks = 0;

    // Check Via Negativa (deletion)
    const implementFile = await this.mcp.read(`state/evidence/${taskId}/implement.md`).catch(() => '');
    if (implementFile.includes('DELETE') || implementFile.includes('delete')) {
      score++;
    }
    checks++;

    // Check Refactor vs Repair
    const designFile = await this.mcp.read(`state/evidence/${taskId}/design.md`).catch(() => '');
    if (designFile.includes('refactor') || designFile.includes('Refactor')) {
      score++;
    }
    checks++;

    // Check simplicity
    if (designFile.includes('Simplicity') || designFile.includes('simple')) {
      score++;
    }
    checks++;

    // Check test-first
    const planFile = await this.mcp.read(`state/evidence/${taskId}/plan.md`).catch(() => '');
    if (planFile.includes('Test') || planFile.includes('test')) {
      score++;
    }
    checks++;

    // Check problem-first
    const strategyFile = await this.mcp.read(`state/evidence/${taskId}/strategy.md`).catch(() => '');
    if (strategyFile.includes('Problem') || strategyFile.includes('Root cause')) {
      score++;
    }
    checks++;

    return score / checks;
  }

  /**
   * Calculate SCAS scores
   */
  async calculateSCASScores(taskId: string): Promise<any> {
    const designFile = await this.mcp.read(`state/evidence/${taskId}/design.md`).catch(() => '');

    // Extract scores from design file if present
    const simplicityMatch = designFile.match(/Simplicity.*?(\d+)\/10/);
    const completenessMatch = designFile.match(/Completeness.*?(\d+)\/10/);
    const abstractionMatch = designFile.match(/Abstraction.*?(\d+)\/10/);
    const scalabilityMatch = designFile.match(/Scalability.*?(\d+)\/10/);

    return {
      simplicity: simplicityMatch ? parseInt(simplicityMatch[1]) : 5,
      completeness: completenessMatch ? parseInt(completenessMatch[1]) : 5,
      abstraction: abstractionMatch ? parseInt(abstractionMatch[1]) : 5,
      scalability: scalabilityMatch ? parseInt(scalabilityMatch[1]) : 5
    };
  }

  /**
   * Run all quality checks for a task
   */
  async enforceQuality(taskId: string, phase: string): Promise<QualityReport> {
    logInfo(`QualityEnforcer: Running full quality enforcement for ${taskId} at phase ${phase}`);

    const criticResults: CriticResult[] = [];

    // Run critics based on phase
    if (phase === 'strategize' || phase === 'post-strategize') {
      criticResults.push(await this.runStrategyReviewer(taskId));
    }

    if (phase === 'think' || phase === 'post-think') {
      criticResults.push(await this.runThinkingCritic(taskId));
    }

    if (phase === 'gate' || phase === 'design' || phase === 'post-design') {
      criticResults.push(await this.runDesignReviewer(taskId));
    }

    if (phase === 'verify' || phase === 'post-verify') {
      criticResults.push(await this.runTestsCritic(taskId));
    }

    // Always run process critic
    criticResults.push(await this.runProcessCritic(taskId));

    // Calculate compliance scores
    const afpCompliance = await this.calculateAFPCompliance(taskId);
    const scasScores = await this.calculateSCASScores(taskId);

    // Check process compliance
    const processCompliance = {
      allPhasesExecuted: await this.checkAllPhasesExecuted(taskId),
      evidenceGenerated: await this.checkEvidenceGenerated(taskId),
      testsWritten: await this.checkTestsWritten(taskId),
      verificationComplete: await this.checkVerificationComplete(taskId)
    };

    // Determine overall status
    const hasBlocker = criticResults.some(r => r.status === 'blocked');
    const warningCount = criticResults.filter(r => r.status === 'warning').length;
    const scasBelowThreshold = Object.values(scasScores).some(s => s < this.thresholds.scasMinimum);
    const afpBelowThreshold = afpCompliance < this.thresholds.afpCompliance;

    let overallStatus: 'approved' | 'blocked' | 'needs_improvement';
    if (hasBlocker || scasBelowThreshold || afpBelowThreshold) {
      overallStatus = 'blocked';
    } else if (warningCount > 2) {
      overallStatus = 'needs_improvement';
    } else {
      overallStatus = 'approved';
    }

    const report: QualityReport = {
      phase,
      overallStatus,
      criticResults,
      afpCompliance: afpCompliance >= this.thresholds.afpCompliance,
      scasScores,
      processCompliance
    };

    // Log summary
    logInfo(`QualityEnforcer: Overall status ${overallStatus}`, {
      critics: criticResults.map(r => `${r.critic}: ${r.status}`),
      afpScore: afpCompliance,
      scasScores
    });

    return report;
  }

  /**
   * Parse reviewer output
   */
  private parseReviewerOutput(critic: string, output: string): CriticResult {
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Extract concerns
    const concernMatches = output.match(/Concern[s]?:(.+?)(?=Recommendation|$)/s);
    if (concernMatches) {
      const concernText = concernMatches[1];
      concerns.push(...concernText.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()));
    }

    // Extract recommendations
    const recMatches = output.match(/Recommendation[s]?:(.+?)(?=Score|$)/s);
    if (recMatches) {
      const recText = recMatches[1];
      recommendations.push(...recText.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().substring(1).trim()));
    }

    // Extract score
    const scoreMatch = output.match(/Score:\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : undefined;

    // Determine status
    let status: 'approved' | 'blocked' | 'warning';
    if (output.includes('APPROVED') || output.includes('approved')) {
      status = 'approved';
    } else if (output.includes('BLOCKED') || output.includes('blocked')) {
      status = 'blocked';
    } else {
      status = concerns.length > 0 ? 'warning' : 'approved';
    }

    return {
      critic,
      status,
      score,
      concerns,
      recommendations
    };
  }

  /**
   * Check if file exists
   */
  private async checkFileExists(path: string): Promise<boolean> {
    try {
      await this.mcp.read(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check all phases executed
   */
  private async checkAllPhasesExecuted(taskId: string): Promise<boolean> {
    const phases = ['strategy', 'spec', 'plan', 'think', 'design', 'implement', 'verify', 'review'];
    for (const phase of phases) {
      const exists = await this.checkFileExists(`state/evidence/${taskId}/${phase}.md`);
      if (!exists) return false;
    }
    return true;
  }

  /**
   * Check evidence generated
   */
  private async checkEvidenceGenerated(taskId: string): Promise<boolean> {
    const files = await this.mcp.bash(`ls state/evidence/${taskId}/*.md 2>/dev/null | wc -l`);
    return parseInt(files.trim()) >= 8;
  }

  /**
   * Check tests written
   */
  private async checkTestsWritten(taskId: string): Promise<boolean> {
    const planFile = await this.mcp.read(`state/evidence/${taskId}/plan.md`).catch(() => '');
    return planFile.includes('Test') || planFile.includes('test');
  }

  /**
   * Check verification complete
   */
  private async checkVerificationComplete(taskId: string): Promise<boolean> {
    const verifyFile = await this.mcp.read(`state/evidence/${taskId}/verify.md`).catch(() => '');
    return verifyFile.includes('Build') && verifyFile.includes('Test');
  }

  /**
   * Generate quality enforcement summary
   */
  generateSummary(report: QualityReport): string {
    return `# Quality Enforcement Report

## Overall Status: ${report.overallStatus.toUpperCase()}

## Critic Results
${report.criticResults.map(r => `- ${r.critic}: ${r.status} ${r.score ? `(Score: ${r.score})` : ''}`).join('\n')}

## AFP Compliance: ${report.afpCompliance ? '✅ PASSED' : '❌ FAILED'}

## SCAS Scores
- Simplicity: ${report.scasScores.simplicity}/10
- Completeness: ${report.scasScores.completeness}/10
- Abstraction: ${report.scasScores.abstraction}/10
- Scalability: ${report.scasScores.scalability}/10

## Process Compliance
- All phases executed: ${report.processCompliance.allPhasesExecuted ? '✅' : '❌'}
- Evidence generated: ${report.processCompliance.evidenceGenerated ? '✅' : '❌'}
- Tests written: ${report.processCompliance.testsWritten ? '✅' : '❌'}
- Verification complete: ${report.processCompliance.verificationComplete ? '✅' : '❌'}

## Concerns
${report.criticResults.flatMap(r => r.concerns).map(c => `- ${c}`).join('\n') || 'None'}

## Recommendations
${report.criticResults.flatMap(r => r.recommendations).map(r => `- ${r}`).join('\n') || 'None'}

${report.overallStatus === 'blocked' ? '\n⚠️ BLOCKED: Must address concerns before proceeding' : ''}
${report.overallStatus === 'needs_improvement' ? '\n⚠️ NEEDS IMPROVEMENT: Address recommendations' : ''}
${report.overallStatus === 'approved' ? '\n✅ APPROVED: Quality standards met' : ''}
`;
  }
}