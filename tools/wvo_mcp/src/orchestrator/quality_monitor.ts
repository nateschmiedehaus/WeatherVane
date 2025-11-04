import { EventEmitter } from 'node:events';
import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import {
  QualityFramework,
  type ComprehensiveQualityReport,
  type QualityAssessment,
  type QualityDimension,
} from '../quality/quality_framework.js';
import type { LiveFlagsReader } from '../state/live_flags.js';
import { logWarning } from '../telemetry/logger.js';

import type { AgentType } from './agent_pool.js';
import { FeatureGates } from './feature_gates.js';
import type { QualityMetric, StateMachine, Task } from './state_machine.js';


export interface QualityCheckInput {
  task: Task;
  agentId: string;
  agentType: AgentType;
  success: boolean;
  durationSeconds: number;
  outputExcerpt?: string;
}

export interface QualityCheckResult {
  status: 'pass' | 'fail';
  score: number;
  metrics: QualityMetric[];
  issues: string[];
  report: ComprehensiveQualityReport;
}

interface QualityMonitorOptions {
  workspaceRoot?: string;
  maxAssessmentEntries?: number;
  liveFlags?: LiveFlagsReader;
}

interface DimensionEvaluation {
  metrics: QualityMetric[];
  assessments: QualityAssessment[];
  overallScorePercent: number;
  overallScoreNormalized: number;
  issues: string[];
  pass: boolean;
  report: ComprehensiveQualityReport;
}

interface QualityAssessmentLogEntry {
  timestamp: string;
  task_id?: string;
  task_title?: string;
  agent_id: string;
  agent_type: AgentType;
  success: boolean;
  duration_seconds: number;
  estimated_complexity?: number;
  execution_score: number;
  timeliness_score: number;
  overall_score: number;
  dimension_scores: Record<QualityDimension, number>;
  world_class_areas: string[];
  needs_attention: string[];
  next_actions: string[];
  assessments: QualityAssessment[];
  issues: string[];
}

const EXECUTION_PASS_THRESHOLD = 0.85;
const DIMENSION_PASS_THRESHOLD = 78;
const WORLD_CLASS_THRESHOLD = 95;

/**
 * QualityMonitor evaluates task executions, records metrics, and determines whether
 * a task can advance or needs additional work.
 */
export class QualityMonitor extends EventEmitter {
  private readonly qualityFramework = new QualityFramework();
  private readonly assessmentLogPath: string;
  private readonly maxAssessmentEntries: number;
  private readonly liveFlags?: LiveFlagsReader;
  private readonly featureGates?: FeatureGates;

  constructor(
    private readonly stateMachine: StateMachine,
    options: QualityMonitorOptions = {},
  ) {
    super();
    const workspaceRoot =
      options.workspaceRoot ?? this.stateMachine.getWorkspaceRoot?.() ?? process.cwd();
    this.assessmentLogPath = path.join(
      workspaceRoot,
      'state',
      'quality',
      'assessment_log.json',
    );
    const requestedLimit = options.maxAssessmentEntries ?? 120;
    this.maxAssessmentEntries = Math.max(10, Math.min(requestedLimit, 500));
    this.liveFlags = options.liveFlags;
    this.featureGates = options.liveFlags ? new FeatureGates(options.liveFlags) : undefined;
  }

  async evaluate(input: QualityCheckInput): Promise<QualityCheckResult> {
    const { task, agentId, agentType, success, durationSeconds, outputExcerpt } = input;
    const now = Date.now();

    const complexity = task.estimated_complexity ?? 5;
    const expectedSeconds = Math.max(120, complexity * 300); // rough estimate: 5 minutes per complexity point
    const executionScore = success ? 0.92 : 0.2;

    const timelinessRatio = expectedSeconds / Math.max(durationSeconds, 1);
    const timelinessScore = Math.min(1, Math.max(0.1, timelinessRatio));

    const metrics: QualityMetric[] = [
      {
        timestamp: now,
        task_id: task.id,
        dimension: 'execution',
        score: executionScore,
        details: {
          agent_id: agentId,
          agent_type: agentType,
          success,
          duration: durationSeconds,
        },
      },
      {
        timestamp: now,
        task_id: task.id,
        dimension: 'timeliness',
        score: timelinessScore,
        details: {
          expected_seconds: expectedSeconds,
          actual_seconds: durationSeconds,
        },
      },
    ];

    if (outputExcerpt) {
      metrics.push({
        timestamp: now,
        task_id: task.id,
        dimension: 'output_excerpt',
        score: success ? 0.9 : 0.3,
        details: {
          snippet: outputExcerpt.slice(0, 4000),
        },
      });
    }

    const baseIssues = new Set<string>();

    if (!success) {
      baseIssues.add('execution_failed');
    }

    if (timelinessScore < 0.6) {
      baseIssues.add('execution_too_slow');
    }

    const dimensionEvaluation = this.evaluateDimensions({
      task,
      agentId,
      agentType,
      success,
      durationSeconds,
      expectedSeconds,
      timelinessScore,
      now,
      baseIssues,
    });

    const allMetrics = metrics.concat(dimensionEvaluation.metrics);
    for (const metric of allMetrics) {
      this.stateMachine.recordQuality(metric);
    }

    await this.appendAssessmentLog({
      timestamp: new Date(now).toISOString(),
      task_id: task.id,
      task_title: task.title,
      agent_id: agentId,
      agent_type: agentType,
      success,
      duration_seconds: durationSeconds,
      estimated_complexity: task.estimated_complexity,
      execution_score: Number(executionScore.toFixed(3)),
      timeliness_score: Number(timelinessScore.toFixed(3)),
      overall_score: Number(dimensionEvaluation.report.overall_score.toFixed(1)),
      dimension_scores: dimensionEvaluation.report.dimension_scores,
      world_class_areas: dimensionEvaluation.report.world_class_areas,
      needs_attention: dimensionEvaluation.report.needs_attention,
      next_actions: dimensionEvaluation.report.next_actions,
      assessments: dimensionEvaluation.report.assessments,
      issues: dimensionEvaluation.issues,
    });

    const status: QualityCheckResult['status'] = dimensionEvaluation.pass ? 'pass' : 'fail';

    this.emit('quality:evaluated', {
      taskId: task.id,
      agentId,
      status,
      score: dimensionEvaluation.overallScoreNormalized,
      issues: dimensionEvaluation.issues,
      report: dimensionEvaluation.report,
    });

    return {
      status,
      score: dimensionEvaluation.overallScoreNormalized,
      metrics: allMetrics,
      issues: dimensionEvaluation.issues,
      report: dimensionEvaluation.report,
    };
  }

  private evaluateDimensions(input: {
    task: Task;
    agentId: string;
    agentType: AgentType;
    success: boolean;
    durationSeconds: number;
    expectedSeconds: number;
    timelinessScore: number;
    now: number;
    baseIssues: Set<string>;
  }): DimensionEvaluation {
    const {
      task,
      agentId,
      agentType,
      success,
      durationSeconds,
      expectedSeconds,
      timelinessScore,
      now,
      baseIssues,
    } = input;

    const issueSet = this.collectIssues(task, baseIssues);
    const dimensionScores = this.initialDimensionScores(success, timelinessScore);
    this.applyIssuePenalties(dimensionScores, issueSet);
    this.applyTaskHeuristics(dimensionScores, task, durationSeconds, expectedSeconds, success);

    const dimensionMetrics: QualityMetric[] = [];
    const assessments: QualityAssessment[] = [];
    const dimensionScoresRecord: Record<QualityDimension, number> = {} as Record<
      QualityDimension,
      number
    >;
    const additionalIssues: string[] = [];

    const allDimensions = this.getAllDimensions();
    const activeDimensionSet = this.lazyDimensionsEnabled()
      ? new Set(this.selectRelevantDimensions(task))
      : new Set(allDimensions);

    if (activeDimensionSet.size === 0) {
      for (const fallback of ['code_elegance', 'maintainability', 'testing_coverage'] as QualityDimension[]) {
        activeDimensionSet.add(fallback);
      }
    }

    let scoreAccumulator = 0;

    for (const dimension of allDimensions) {
      const scorePercent = this.clampScore(dimensionScores[dimension]);
      dimensionScoresRecord[dimension] = Number(scorePercent.toFixed(1));

      if (!activeDimensionSet.has(dimension)) {
        continue;
      }

      scoreAccumulator += scorePercent;

      const standard = this.qualityFramework.getStandard(dimension);
      const strengths: string[] = [];
      const improvements: string[] = [];

      if (scorePercent >= standard.target_score) {
        strengths.push(
          `${this.dimensionLabel(dimension)} meets the target (${Math.round(
            scorePercent,
          )} ≥ ${standard.target_score}).`,
        );
      } else {
        const criteria = standard.assessment_criteria.slice(0, 2).join('; ');
        improvements.push(
          `Raise ${this.dimensionLabel(dimension).toLowerCase()} by focusing on: ${criteria}.`,
        );
        additionalIssues.push(`quality_dimension:${dimension}:needs_attention`);
      }

      const recommendation =
        improvements.length > 0
          ? `Prioritise ${this.dimensionLabel(dimension).toLowerCase()} improvements next.`
          : `Maintain world-class ${this.dimensionLabel(dimension).toLowerCase()} standards.`;

      assessments.push({
        dimension,
        score: Math.round(scorePercent),
        strengths,
        improvements,
        recommendation,
      });

      dimensionMetrics.push({
        timestamp: now,
        task_id: task.id,
        dimension: `dimension:${dimension}`,
        score: Number((scorePercent / 100).toFixed(4)),
        details: {
          agent_id: agentId,
          agent_type: agentType,
          absolute_score: Number(scorePercent.toFixed(1)),
          target_score: standard.target_score,
          issues: additionalIssues.filter((issue) => issue.includes(dimension)),
        },
      });
    }

    const denominator = assessments.length > 0 ? assessments.length : activeDimensionSet.size;
    const overallScorePercent = denominator > 0 ? scoreAccumulator / denominator : 0;
    const overallScoreNormalized = Number((overallScorePercent / 100).toFixed(4));

    const worldClassAreas = assessments
      .filter((assessment) => assessment.score >= WORLD_CLASS_THRESHOLD)
      .map((assessment) => this.dimensionLabel(assessment.dimension));

    const needsAttention = assessments
      .filter((assessment) => assessment.score < DIMENSION_PASS_THRESHOLD)
      .map((assessment) => this.dimensionLabel(assessment.dimension));

    const nextActions = this.qualityFramework.generateImprovementRecommendations(assessments);

    const report: ComprehensiveQualityReport = {
      overall_score: Number(overallScorePercent.toFixed(1)),
      dimension_scores: dimensionScoresRecord,
      assessments,
      world_class_areas: worldClassAreas,
      needs_attention: needsAttention,
      next_actions: nextActions,
    };

    const issues = Array.from(new Set([...issueSet, ...additionalIssues]));
    const pass =
      success &&
      overallScoreNormalized >= EXECUTION_PASS_THRESHOLD &&
      needsAttention.length === 0;

    dimensionMetrics.push({
      timestamp: now,
      task_id: task.id,
      dimension: 'dimension:overall',
      score: overallScoreNormalized,
      details: {
        agent_id: agentId,
        agent_type: agentType,
        absolute_score: Number(overallScorePercent.toFixed(1)),
        needs_attention: needsAttention,
        world_class_areas: worldClassAreas,
      },
    });

    return {
      metrics: dimensionMetrics,
      assessments,
      overallScorePercent,
      overallScoreNormalized,
      issues,
      pass,
      report,
    };
  }

  private collectIssues(task: Task, baseIssues: Set<string>): Set<string> {
    const issueSet = new Set(baseIssues);

    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    const metadataIssues = Array.isArray(metadata.quality_issues)
      ? metadata.quality_issues
      : [];

    for (const issue of metadataIssues) {
      if (typeof issue === 'string') {
        issueSet.add(issue);
      }
    }

    const priorIssues = Array.isArray(metadata.prior_quality_signals)
      ? metadata.prior_quality_signals
      : [];
    for (const issue of priorIssues) {
      if (typeof issue === 'string') {
        issueSet.add(issue);
      }
    }

    return issueSet;
  }

  private initialDimensionScores(
    success: boolean,
    timelinessScore: number,
  ): Record<QualityDimension, number> {
    const baseWin = success ? 92 : 70;
    const baseConcern = success ? 88 : 62;
    const performanceBase = Math.max(
      55,
      Math.min(100, timelinessScore * 100 * 1.05),
    );

    return {
      code_elegance: baseWin,
      architecture_design: baseConcern,
      user_experience: baseConcern,
      communication_clarity: baseWin - 2,
      scientific_rigor: baseConcern,
      performance_efficiency: performanceBase,
      maintainability: baseConcern,
      security_robustness: baseWin - 1,
      documentation_quality: baseConcern - 2,
      testing_coverage: success ? 90 : 58,
    };
  }

  private applyIssuePenalties(
    scores: Record<QualityDimension, number>,
    issues: Set<string>,
  ): void {
    const applyPenalty = (dimension: QualityDimension, amount: number) => {
      scores[dimension] = this.clampScore(scores[dimension] - amount);
    };

    for (const issue of issues) {
      if (issue.startsWith('critic_failed:')) {
        const critic = issue.split(':')[1];
        switch (critic) {
          case 'tests':
          case 'tests.run':
            applyPenalty('testing_coverage', 25);
            applyPenalty('maintainability', 8);
            break;
          case 'design_system':
            applyPenalty('user_experience', 28);
            applyPenalty('communication_clarity', 10);
            break;
          case 'allocator':
          case 'cost_perf':
            applyPenalty('performance_efficiency', 20);
            break;
          case 'security':
            applyPenalty('security_robustness', 35);
            break;
          case 'data_quality':
            applyPenalty('scientific_rigor', 22);
            break;
          case 'exec_review':
            applyPenalty('communication_clarity', 18);
            break;
          case 'manager_self_check':
            applyPenalty('architecture_design', 15);
            applyPenalty('maintainability', 10);
            break;
          default:
            applyPenalty('code_elegance', 6);
            break;
        }
        continue;
      }

      switch (issue) {
        case 'execution_failed':
          for (const dimension of this.getAllDimensions()) {
            applyPenalty(dimension, 12);
          }
          applyPenalty('testing_coverage', 8);
          break;
        case 'execution_too_slow':
          applyPenalty('performance_efficiency', 22);
          applyPenalty('maintainability', 6);
          break;
        case 'network_error':
          applyPenalty('user_experience', 12);
          applyPenalty('performance_efficiency', 10);
          break;
        case 'context_limit':
          applyPenalty('architecture_design', 18);
          applyPenalty('maintainability', 12);
          break;
        case 'output_validation_failed':
          applyPenalty('testing_coverage', 28);
          applyPenalty('maintainability', 10);
          applyPenalty('communication_clarity', 6);
          break;
        case 'lint_error':
          applyPenalty('code_elegance', 18);
          break;
        case 'security_violation':
          applyPenalty('security_robustness', 32);
          break;
        case 'docs_missing':
          applyPenalty('documentation_quality', 25);
          applyPenalty('communication_clarity', 10);
          break;
        case 'performance_regression':
          applyPenalty('performance_efficiency', 28);
          break;
        case 'unstable_tests':
          applyPenalty('testing_coverage', 22);
          applyPenalty('maintainability', 12);
          break;
        default:
          break;
      }
    }
  }

  private applyTaskHeuristics(
    scores: Record<QualityDimension, number>,
    task: Task,
    durationSeconds: number,
    expectedSeconds: number,
    success: boolean,
  ): void {
    const title = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();

    if (title.includes('docs') || title.includes('documentation')) {
      scores.documentation_quality = this.clampScore(scores.documentation_quality + 3);
    }
    if (title.includes('api') || title.includes('interface')) {
      scores.communication_clarity = this.clampScore(scores.communication_clarity + 3);
      scores.user_experience = this.clampScore(scores.user_experience + 3);
    }
    if (title.includes('performance') || title.includes('latency')) {
      scores.performance_efficiency = this.clampScore(scores.performance_efficiency + 4);
    }
    if (title.includes('security') || title.includes('auth')) {
      scores.security_robustness = this.clampScore(scores.security_robustness + 5);
    }
    if (title.includes('test') || title.includes('coverage')) {
      scores.testing_coverage = this.clampScore(scores.testing_coverage + 5);
    }

    const durationRatio = durationSeconds / Math.max(expectedSeconds, 1);
    if (durationRatio > 1.4) {
      scores.performance_efficiency = this.clampScore(
        scores.performance_efficiency - (durationRatio - 1.0) * 20,
      );
    } else if (durationRatio < 0.7) {
      scores.performance_efficiency = this.clampScore(
        scores.performance_efficiency + (0.7 - durationRatio) * 10,
      );
    }

    if (!success && (task.status === 'needs_review' || task.status === 'needs_improvement')) {
      scores.maintainability = this.clampScore(scores.maintainability - 10);
      scores.code_elegance = this.clampScore(scores.code_elegance - 8);
    }
  }

  private async appendAssessmentLog(entry: QualityAssessmentLogEntry): Promise<void> {
    try {
      await fsPromises.mkdir(path.dirname(this.assessmentLogPath), { recursive: true });

      let existingEntries: QualityAssessmentLogEntry[] = [];
      let version = 1;

      if (fs.existsSync(this.assessmentLogPath)) {
        try {
          const raw = await fsPromises.readFile(this.assessmentLogPath, 'utf8');
          const parsed = JSON.parse(raw) as {
            entries?: QualityAssessmentLogEntry[];
            version?: number;
          };
          if (Array.isArray(parsed.entries)) {
            existingEntries = parsed.entries;
          }
          if (typeof parsed.version === 'number') {
            version = parsed.version;
          }
        } catch (error) {
          logWarning('Failed to parse existing quality assessment log; starting fresh.', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      existingEntries.push(entry);

      if (existingEntries.length > this.maxAssessmentEntries) {
        existingEntries = existingEntries.slice(-this.maxAssessmentEntries);
      }

      const payload = {
        version,
        generated_at: entry.timestamp,
        total_entries: existingEntries.length,
        entries: existingEntries,
      };

      await fsPromises.writeFile(
        this.assessmentLogPath,
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8',
      );
    } catch (error) {
      logWarning('Failed to append quality assessment log entry', {
        path: this.assessmentLogPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getAllDimensions(): QualityDimension[] {
    return [
      'code_elegance',
      'architecture_design',
      'user_experience',
      'communication_clarity',
      'scientific_rigor',
      'performance_efficiency',
      'maintainability',
      'security_robustness',
      'documentation_quality',
      'testing_coverage',
    ];
  }

  private lazyDimensionsEnabled(): boolean {
    return this.featureGates?.isEfficientOperationsEnabled() ?? false;
  }

  private selectRelevantDimensions(task: Task): QualityDimension[] {
    const baseline: QualityDimension[] = ['code_elegance', 'testing_coverage', 'maintainability'];
    const result: QualityDimension[] = [...baseline];
    const text = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();

    if (/security|auth|oauth|encryption|permission|cve/.test(text)) {
      result.push('security_robustness', 'documentation_quality');
    }

    if (/test|coverage|pytest|unittest/.test(text)) {
      result.push('testing_coverage', 'maintainability');
    }

    if (/design|ui|ux|accessibility|storybook/.test(text)) {
      result.push('user_experience', 'communication_clarity', 'documentation_quality');
    }

    if (/performance|latency|throughput|optimi[sz]e|scal/.test(text)) {
      result.push('performance_efficiency', 'architecture_design');
    }

    if (/architecture|refactor|framework|module/i.test(task.title ?? '')) {
      result.push('architecture_design');
    }

    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    const metadataDimensions = Array.isArray(metadata.focus_dimensions)
      ? metadata.focus_dimensions.filter((dimension): dimension is QualityDimension =>
          typeof dimension === 'string' && this.getAllDimensions().includes(dimension as QualityDimension)
        )
      : [];

    result.push(...metadataDimensions);

    return this.uniqueDimensions(result);
  }

  private uniqueDimensions(dimensions: QualityDimension[]): QualityDimension[] {
    const seen = new Set<QualityDimension>();
    const ordered: QualityDimension[] = [];
    for (const dimension of dimensions) {
      if (!seen.has(dimension)) {
        seen.add(dimension);
        ordered.push(dimension);
      }
    }
    return ordered;
  }

  private dimensionLabel(dimension: QualityDimension): string {
    switch (dimension) {
      case 'code_elegance':
        return 'Code Elegance';
      case 'architecture_design':
        return 'Architecture & Design';
      case 'user_experience':
        return 'User Experience';
      case 'communication_clarity':
        return 'Communication Clarity';
      case 'scientific_rigor':
        return 'Scientific Rigor';
      case 'performance_efficiency':
        return 'Performance & Efficiency';
      case 'maintainability':
        return 'Maintainability';
      case 'security_robustness':
        return 'Security & Robustness';
      case 'documentation_quality':
        return 'Documentation Quality';
      case 'testing_coverage':
        return 'Testing Coverage';
      default:
        return dimension;
    }
  }

  private clampScore(value: number): number {
    if (Number.isNaN(value)) {
      return 0;
    }
    return Math.min(100, Math.max(0, value));
  }
}
